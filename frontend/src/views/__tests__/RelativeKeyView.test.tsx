import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../context/ToastContext';
import { RelativeKeyView } from '../RelativeKeyView';
import { peekToolPayload } from '../../lib/toolState';

function renderView(navigate: (view: string) => void = () => {}) {
  return render(
    <ToastProvider>
      <RelativeKeyView navigate={navigate} />
    </ToastProvider>
  );
}

describe('RelativeKeyView', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows the relative minor of a major key with shared notes', async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText('Key'), 'G');
    expect(
      screen.getByText(/G major .* E minor/, { selector: '.tool-result-key' })
    ).toBeInTheDocument();
    expect(screen.getByText('Shared scale notes')).toBeInTheDocument();
    expect(screen.getByText('F#', { selector: '.tool-chip' })).toBeInTheDocument();
    expect(screen.getByText(/6th degree \(vi\)/)).toBeInTheDocument();
  });

  it('shows the relative major of a minor key', async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'minor');
    await userEvent.selectOptions(screen.getByLabelText('Key'), 'Am');
    expect(
      screen.getByText(/A minor .* C major/, { selector: '.tool-result-key' })
    ).toBeInTheDocument();
  });

  it('offers practical transition guidance', async () => {
    renderView();
    expect(screen.getByText('Using it in a set')).toBeInTheDocument();
  });

  it('links into the diatonic finder with the chosen key', async () => {
    const navigate = vi.fn();
    renderView(navigate);
    await userEvent.selectOptions(screen.getByLabelText('Key'), 'D');
    await userEvent.click(screen.getByRole('button', { name: /Diatonic chords of D/ }));
    expect(navigate).toHaveBeenCalledWith('tools-diatonic');
    expect(peekToolPayload()).toMatchObject({ key: 'D' });
  });
});
