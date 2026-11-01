import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportModal } from '../ImportModal';
import { importSongs } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  importSongs: vi.fn(async () => ({ imported: 1, skipped: [{ index: 1, reason: 'already_exists' }], errors: [] })),
  ApiError: class extends Error {
    status = 0;
  },
}));
vi.mock('../../hooks/useApi', () => ({ useApi: () => vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { token: 'tok' } }) }));
vi.mock('../../context/DemoContext', () => ({ useDemo: () => ({ demoMode: false }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

function file(name: string, content: string) {
  return new File([content], name, { type: 'text/plain' });
}

describe('ImportModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('imports selected files and shows a summary', async () => {
    render(<ImportModal onClose={() => {}} onDone={() => {}} />);
    const input = screen.getByTestId('import-file-input') as HTMLInputElement;
    await userEvent.upload(input, [
      file('A.cho', '{title: Test Song}\n{artist: Test Artist}\n{key: G}\n{capo: 2}\n[G]a'),
      file('B.cho', '[G]a'),
    ]);
    await userEvent.click(screen.getByTestId('import-start'));
    await waitFor(() => {
      expect(screen.getByTestId('import-review')).toHaveTextContent('Test Song · Test Artist · Key G · Capo 2');
      expect(screen.getByTestId('import-review')).toHaveTextContent('No standard section headings detected.');
    });
    expect(importSongs).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm import to library' }));
    await waitFor(() => {
      expect(screen.getByTestId('import-summary')).toHaveTextContent('1 imported');
      expect(screen.getByTestId('import-summary')).toHaveTextContent('1 already in your library');
    });
  });

  it('allows correction before an explicit library write', async () => {
    render(<ImportModal onClose={() => {}} onDone={() => {}} />);
    await userEvent.upload(
      screen.getByTestId('import-file-input'),
      file('A.cho', '{title: A}\n{key: G}\nVerse 1\n[G]Original'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review files' }));
    await screen.findByText('No structural warnings');
    expect(importSongs).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('Compare and edit A.cho'));
    const draft = screen.getByLabelText('Editable chart for A.cho');
    await userEvent.clear(draft);
    await userEvent.type(draft, 'Verse 1\n[[C]Corrected');
    expect(screen.getByText('Rendered preview — A.cho')).toBeInTheDocument();
    expect(screen.getByText(/Key was not detected/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm import to library' }));
    await waitFor(() => expect(importSongs).toHaveBeenCalledWith([{ content: 'Verse 1\n[C]Corrected' }], 'tok'));
  });

  it('discards without saving and clears stale review on file changes', async () => {
    render(<ImportModal onClose={() => {}} onDone={() => {}} />);
    const input = screen.getByTestId('import-file-input');
    await userEvent.upload(input, file('A.cho', '[G]Original'));
    await userEvent.click(screen.getByRole('button', { name: 'Review files' }));
    await screen.findByText('Compare and edit A.cho');
    await userEvent.upload(input, file('B.cho', '[C]Replacement'));
    expect(screen.queryByTestId('import-review')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Review files' }));
    await screen.findByText('Compare and edit B.cho');
    await userEvent.click(screen.getByRole('button', { name: 'Discard review' }));
    expect(screen.queryByTestId('import-review')).not.toBeInTheDocument();
    expect(importSongs).not.toHaveBeenCalled();
  });
});
