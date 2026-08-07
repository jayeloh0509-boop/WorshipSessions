import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../context/ToastContext';
import { DiatonicChordsView } from '../DiatonicChordsView';
import { stashToolPayload, peekToolPayload } from '../../lib/toolState';

function renderView(navigate: (view: string) => void = () => {}) {
  return render(
    <ToastProvider>
      <DiatonicChordsView navigate={navigate} />
    </ToastProvider>
  );
}

describe('DiatonicChordsView', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows all seven diatonic triads for a major key', async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText('Key'), 'C');
    const cards = document.querySelectorAll('.diatonic-card');
    expect(cards).toHaveLength(7);
    const symbols = Array.from(document.querySelectorAll('.diatonic-symbol')).map(
      (el) => el.textContent
    );
    expect(symbols).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(screen.getByText('vii°')).toBeInTheDocument();
    expect(screen.getByText('Nashville 7°')).toBeInTheDocument();
  });

  it('shows natural minor triads with lowered degrees', async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'minor');
    await userEvent.selectOptions(screen.getByLabelText('Key'), 'Am');
    const symbols = Array.from(document.querySelectorAll('.diatonic-symbol')).map(
      (el) => el.textContent
    );
    expect(symbols).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(screen.getByText('Nashville b3')).toBeInTheDocument();
  });

  it('renders common worship progressions in the chosen key', async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText('Key'), 'G');
    expect(screen.getByText('I – V – vi – IV')).toBeInTheDocument();
    const firstRow = document.querySelector('.prog-row')!;
    expect(firstRow.textContent).toContain('G');
    expect(firstRow.textContent).toContain('Em');
  });

  it('copies a progression', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderView();
    await userEvent.selectOptions(screen.getByLabelText('Key'), 'G');
    const firstCopy = document.querySelector('.prog-row .prog-copy') as HTMLElement;
    await userEvent.click(firstCopy);
    expect(writeText).toHaveBeenCalledWith('G  D  Em  C');
  });

  it('receives a key from a handoff and links onward with it', async () => {
    stashToolPayload({ key: 'Em' });
    const navigate = vi.fn();
    renderView(navigate);
    expect(screen.getByLabelText('Mode')).toHaveValue('minor');
    expect(screen.getByLabelText('Key')).toHaveValue('Em');
    await userEvent.click(screen.getByRole('button', { name: /Find the relative key/ }));
    expect(navigate).toHaveBeenCalledWith('tools-relative');
    expect(peekToolPayload()).toMatchObject({ key: 'Em' });
  });
});
