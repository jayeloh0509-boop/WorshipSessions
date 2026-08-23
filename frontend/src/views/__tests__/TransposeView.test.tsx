import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../context/ToastContext';
import { TransposeView } from '../TransposeView';
import { peekToolPayload, stashToolPayload } from '../../lib/toolState';

function renderView(navigate: (view: string) => void = () => {}) {
  return render(
    <ToastProvider>
      <TransposeView navigate={navigate} />
    </ToastProvider>,
  );
}

describe('TransposeView', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('transposes a progression between selected keys', async () => {
    renderView();
    await userEvent.type(screen.getByLabelText('Chart input'), 'G  C  D');
    await userEvent.selectOptions(screen.getByLabelText('From key'), 'G');
    await userEvent.selectOptions(screen.getByLabelText('To key'), 'A');
    expect(screen.getByLabelText('Transposed chart')).toHaveTextContent('A D E');
    expect(screen.getByText('+2 semitones')).toBeInTheDocument();
  });

  it('preserves lyrics and ChordPro directives', async () => {
    renderView();
    const input = '{key: G}\n[G]Amazing [C]grace';
    const ta = screen.getByLabelText('Chart input');
    await userEvent.click(ta);
    await userEvent.paste(input);
    await userEvent.selectOptions(screen.getByLabelText('From key'), 'G');
    await userEvent.selectOptions(screen.getByLabelText('To key'), 'A');
    const out = screen.getByLabelText('Transposed chart').textContent!;
    expect(out).toContain('{key: A}');
    expect(out).toContain('[A]Amazing [D]grace');
  });

  it('detects the source key from the pasted chart', async () => {
    renderView();
    await userEvent.type(screen.getByLabelText('Chart input'), 'G C D Em G');
    await userEvent.click(screen.getByRole('button', { name: 'Detect key' }));
    expect(screen.getByLabelText('From key')).toHaveValue('G');
  });

  it('supports semitone shifts without a source key', async () => {
    renderView();
    await userEvent.type(screen.getByLabelText('Chart input'), 'G  C  D');
    await userEvent.selectOptions(screen.getByLabelText('Shift by'), 'steps');
    await userEvent.click(screen.getByRole('button', { name: 'Up one semitone' }));
    await userEvent.click(screen.getByRole('button', { name: 'Up one semitone' }));
    expect(screen.getByLabelText('Transposed chart')).toHaveTextContent('A D E');
  });

  it('honors the flat accidental preference', async () => {
    renderView();
    await userEvent.type(screen.getByLabelText('Chart input'), 'G  C  D');
    await userEvent.selectOptions(screen.getByLabelText('Shift by'), 'steps');
    await userEvent.click(screen.getByRole('button', { name: 'Up one semitone' }));
    await userEvent.selectOptions(screen.getByLabelText('Accidentals'), 'flat');
    expect(screen.getByLabelText('Transposed chart')).toHaveTextContent('Ab Db Eb');
  });

  it('uses flats automatically when the target key prefers them', async () => {
    renderView();
    await userEvent.type(screen.getByLabelText('Chart input'), 'G  C  D');
    await userEvent.selectOptions(screen.getByLabelText('From key'), 'G');
    await userEvent.selectOptions(screen.getByLabelText('To key'), 'Bb');
    expect(screen.getByLabelText('Transposed chart')).toHaveTextContent('Bb Eb F');
  });

  it('copies the result to the clipboard with feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderView();
    await userEvent.type(screen.getByLabelText('Chart input'), 'G  C  D');
    await userEvent.selectOptions(screen.getByLabelText('From key'), 'G');
    await userEvent.selectOptions(screen.getByLabelText('To key'), 'A');
    await userEvent.click(screen.getByRole('button', { name: 'Copy result' }));
    expect(writeText).toHaveBeenCalledWith('A  D  E');
  });

  it('resets everything', async () => {
    renderView();
    await userEvent.type(screen.getByLabelText('Chart input'), 'G  C  D');
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Chart input')).toHaveValue('');
  });

  it('receives a chart and key from a handoff and passes results onward', async () => {
    stashToolPayload({ text: 'G  C  D', key: 'G' });
    const navigate = vi.fn();
    renderView(navigate);
    expect(screen.getByLabelText('Chart input')).toHaveValue('G  C  D');
    expect(screen.getByLabelText('From key')).toHaveValue('G');
    await userEvent.selectOptions(screen.getByLabelText('To key'), 'A');
    await userEvent.click(screen.getByRole('button', { name: /Convert to Nashville/ }));
    expect(navigate).toHaveBeenCalledWith('tools-nashville');
    expect(peekToolPayload()).toMatchObject({ text: 'A  D  E', key: 'A' });
  });
});
