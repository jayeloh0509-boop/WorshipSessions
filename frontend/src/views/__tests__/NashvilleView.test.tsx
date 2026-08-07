import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../context/ToastContext';
import { NashvilleView } from '../NashvilleView';
import { stashToolPayload } from '../../lib/toolState';

function renderView(navigate: (view: string) => void = () => {}) {
  return render(
    <ToastProvider>
      <NashvilleView navigate={navigate} />
    </ToastProvider>
  );
}

describe('NashvilleView', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('converts chords to numbers preserving lyrics and layout', async () => {
    renderView();
    const ta = screen.getByLabelText('Chord chart input');
    await userEvent.click(ta);
    await userEvent.paste('G        D/F#     Em7      C\nAmazing grace how sweet the sound');
    const out = screen.getByLabelText('Converted chart').textContent!;
    expect(out).toContain('1');
    expect(out).toContain('5/7');
    expect(out).toContain('6m7');
    expect(out).toContain('Amazing grace how sweet the sound');
  });

  it('handles accidentals for borrowed chords', async () => {
    renderView();
    await userEvent.type(screen.getByLabelText('Chord chart input'), 'G F C');
    const out = screen.getByLabelText('Converted chart').textContent!;
    expect(out).toContain('b7');
  });

  it('converts numbers back to chords for the chosen key', async () => {
    renderView();
    await userEvent.click(screen.getByRole('button', { name: /Numbers .* chords/ }));
    await userEvent.type(screen.getByLabelText('Nashville numbers input'), '1  5/7  6m7  4');
    const out = screen.getByLabelText('Converted chart').textContent!;
    expect(out).toContain('G');
    expect(out).toContain('D/F#');
    expect(out).toContain('Em7');
    expect(out).toContain('C');
  });

  it('shows a degree legend for the chosen key', async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText('Key'), 'C');
    expect(screen.getByText(/Degree legend/)).toBeInTheDocument();
    expect(screen.getByText('Bdim')).toBeInTheDocument();
  });

  it('uses lowered degrees for minor keys', async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'minor');
    await userEvent.selectOptions(screen.getByLabelText('Key'), 'Am');
    await userEvent.type(screen.getByLabelText('Chord chart input'), 'Am F C G');
    const out = screen.getByLabelText('Converted chart').textContent!;
    expect(out).toContain('1m');
    expect(out).toContain('b6');
    expect(out).toContain('b3');
    expect(out).toContain('b7');
  });

  it('explains when nothing could be converted', async () => {
    renderView();
    await userEvent.type(screen.getByLabelText('Chord chart input'), 'just some lyrics here');
    expect(screen.getByText(/Nothing to convert/)).toBeInTheDocument();
  });

  it('receives chart and key from a handoff', () => {
    stashToolPayload({ text: 'D  G  A', key: 'D' });
    renderView();
    expect(screen.getByLabelText('Key')).toHaveValue('D');
    expect(screen.getByLabelText('Chord chart input')).toHaveValue('D  G  A');
  });

  it('copies the converted chart', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderView();
    await userEvent.type(screen.getByLabelText('Chord chart input'), 'G C D');
    await userEvent.click(screen.getByRole('button', { name: 'Copy result' }));
    expect(writeText).toHaveBeenCalledWith('1 4 5');
  });
});
