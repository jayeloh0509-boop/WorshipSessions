import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../context/ToastContext';
import { KeyFinderView } from '../KeyFinderView';
import { peekToolPayload, stashToolPayload } from '../../lib/toolState';

function renderView(navigate: (view: string) => void = () => {}) {
  return render(
    <ToastProvider>
      <KeyFinderView navigate={navigate} />
    </ToastProvider>,
  );
}

describe('KeyFinderView', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows the input with a back-to-Tools control and no result before analyzing', async () => {
    const navigate = vi.fn();
    renderView(navigate);
    expect(screen.getByRole('heading', { name: 'Song Key Finder' })).toBeInTheDocument();
    expect(screen.getByLabelText('Chord input')).toBeInTheDocument();
    expect(document.querySelector('.tool-result')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Back to Tools/ }));
    expect(navigate).toHaveBeenCalledWith('tools');
  });

  it('analyzes only on the explicit Find key action', async () => {
    renderView();
    await userEvent.type(screen.getByLabelText('Chord input'), 'G C D Em G');
    expect(document.querySelector('.tool-result')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Find key' }));
    // 'G major' also labels the working-key chip; assert on the result heading
    expect(document.querySelector('.tool-result-key')).toHaveTextContent('G major');
  });

  it('clears stale results when the input changes', async () => {
    renderView();
    await userEvent.type(screen.getByLabelText('Chord input'), 'G C D Em G');
    await userEvent.click(screen.getByRole('button', { name: 'Find key' }));
    expect(document.querySelector('.tool-result-key')).toHaveTextContent('G major');
    await userEvent.type(screen.getByLabelText('Chord input'), ' Bb');
    expect(document.querySelector('.tool-result-key')).toBeNull();
    expect(document.querySelector('.tool-result')).toBeNull();
  });

  it('shows evidence, scale notes and diatonic chords for the working key', async () => {
    renderView();
    await userEvent.type(screen.getByLabelText('Chord input'), 'G C D Em G');
    await userEvent.click(screen.getByRole('button', { name: 'Find key' }));
    expect(screen.getByText(/distinct chords fit G major/)).toBeInTheDocument();
    expect(screen.getByText('Scale notes')).toBeInTheDocument();
    expect(screen.getByText('Diatonic chords')).toBeInTheDocument();
    expect(screen.getByText('F#dim')).toBeInTheDocument(); // vii° of G major
  });

  it('lets the user choose a plausible alternative as the working key', async () => {
    renderView();
    await userEvent.type(screen.getByLabelText('Chord input'), 'C Am F G');
    await userEvent.click(screen.getByRole('button', { name: 'Find key' }));
    const group = screen.getByRole('group', { name: 'Choose working key' });
    const alt = Array.from(group.querySelectorAll('button')).find((b) => b.getAttribute('aria-pressed') === 'false')!;
    const altKey = alt.textContent!.match(/^[A-G][#b]? (major|minor)/)![0];
    await userEvent.click(alt);
    expect(alt).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Chosen alternative')).toBeInTheDocument();
    const heads = screen.getAllByText(altKey);
    expect(heads.length).toBeGreaterThan(0);
  });

  it('flags out-of-key chords as borrowed', async () => {
    renderView();
    await userEvent.type(screen.getByLabelText('Chord input'), 'G C D Bb G');
    await userEvent.click(screen.getByRole('button', { name: 'Find key' }));
    expect(screen.getByText(/Greyed chords fall outside/)).toBeInTheDocument();
  });

  it('shows an empty state when nothing parses as chords', async () => {
    renderView();
    await userEvent.type(screen.getByLabelText('Chord input'), 'la la la lyrics only');
    await userEvent.click(screen.getByRole('button', { name: 'Find key' }));
    expect(screen.getByText(/No chords recognized/)).toBeInTheDocument();
  });

  it('carries the chart and working key into the Transpose tool', async () => {
    const navigate = vi.fn();
    renderView(navigate);
    await userEvent.type(screen.getByLabelText('Chord input'), 'G C D Em G');
    await userEvent.click(screen.getByRole('button', { name: 'Find key' }));
    await userEvent.click(screen.getByRole('button', { name: /Transpose this chart/ }));
    expect(navigate).toHaveBeenCalledWith('tools-transpose');
    expect(peekToolPayload()).toMatchObject({ text: 'G C D Em G', key: 'G' });
  });

  it('prefills the input from a tool handoff', () => {
    stashToolPayload({ text: 'C  F  G' });
    renderView();
    expect(screen.getByLabelText('Chord input')).toHaveValue('C  F  G');
  });
});
