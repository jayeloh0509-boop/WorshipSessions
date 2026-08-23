import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../context/ToastContext';
import { CapoCalculatorView } from '../CapoCalculatorView';
import { stashToolPayload } from '../../lib/toolState';

function renderView(navigate: (view: string) => void = () => {}) {
  return render(
    <ToastProvider>
      <CapoCalculatorView navigate={navigate} />
    </ToastProvider>,
  );
}

describe('CapoCalculatorView (Capo Chart Pro)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows the capo tool with a back-to-Tools control', async () => {
    const navigate = vi.fn();
    renderView(navigate);
    expect(screen.getByRole('heading', { name: 'Capo Chart Pro' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sounding key')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Back to Tools/ }));
    expect(navigate).toHaveBeenCalledWith('tools');
  });

  it('suggests capo positions with practicality labels for the selected key', async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText('Sounding key'), 'Bb');
    expect(screen.getByText('Capo 3')).toBeInTheDocument();
    expect(screen.getAllByText('Easy').length).toBeGreaterThan(0);
  });

  it('distinguishes no-capo and high positions', async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText('Sounding key'), 'G');
    // 'No capo' is both the fret label and the practicality tier; check the fret label
    expect(screen.getByText('No capo', { selector: '.capo-pos' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Sounding key'), 'F#');
    expect(screen.getAllByText('High & cramped').length).toBeGreaterThan(0);
  });

  it('renders a 0-12 fretboard strip with markers at recommended frets', async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText('Sounding key'), 'Bb');
    const strip = screen.getByRole('group', { name: 'Capo positions for Bb' });
    expect(strip.querySelectorAll('.capo-fret')).toHaveLength(13);
    expect(screen.getByRole('button', { name: 'Capo 3: play G shapes' })).toBeInTheDocument();
  });

  it('supports picking a desired open shape directly', async () => {
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Pick my shapes' }));
    await userEvent.selectOptions(screen.getByLabelText('Sounding key'), 'Bb');
    await userEvent.selectOptions(screen.getByLabelText('Play shapes of'), 'C');
    const options = document.querySelectorAll('.capo-option');
    expect(options[0]).toHaveTextContent('Capo 10');
    expect(options[0]).toHaveTextContent('C');
  });

  it('offers minor shapes for minor sounding keys', async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'minor');
    await userEvent.selectOptions(screen.getByLabelText('Sounding key'), 'Bm');
    expect(screen.getByText('Capo 2')).toBeInTheDocument();
    const shapes = document.querySelectorAll('.capo-option .capo-shape strong');
    expect(shapes.length).toBeGreaterThan(0);
    expect(Array.from(shapes).every((el) => el.textContent!.endsWith('m'))).toBe(true);
  });

  it('previews the player-facing chords for the selected capo', async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText('Sounding key'), 'Bb');
    // The lowest-fret option (capo 1, A shapes) is selected by default; pick capo 3
    await userEvent.click(screen.getByRole('button', { name: 'Capo 3: play G shapes' }));
    await userEvent.type(screen.getByLabelText('Chart preview input'), 'Bb  F/A  Gm7  Eb');
    const output = screen.getByLabelText('Player-facing chords');
    expect(output.textContent).toContain('G');
    expect(output.textContent).toContain('D/F#');
    expect(output.textContent).toContain('Em7');
    expect(output.textContent).toContain('C');
  });

  it('receives a chart and key from a tool handoff', () => {
    stashToolPayload({ text: 'Bb  Eb  F', key: 'Bb' });
    renderView();
    expect(screen.getByLabelText('Sounding key')).toHaveValue('Bb');
    expect(screen.getByLabelText('Chart preview input')).toHaveValue('Bb  Eb  F');
  });
});
