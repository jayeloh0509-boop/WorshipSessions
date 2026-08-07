import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SongSearchModal } from '../SongSearchModal';

const mockApiCall = vi.fn();
const mockToast = vi.fn();
vi.mock('../../hooks/useApi', () => ({ useApi: () => mockApiCall }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => mockToast }));

describe('SongSearchModal public catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiCall.mockImplementation((_method: string, path: string) => {
      if (path === '/api/songs/public-catalog/popular') return Promise.resolve({ songs: [
        { slug: 'amazing-grace', title: 'Amazing Grace', artist: 'John Newton', key: 'G', source: 'WorshipChordBook', license: 'Public Domain' },
      ] });
      if (path.startsWith('/api/songs/public-catalog/search')) return Promise.resolve({ songs: [{ slug: 'amazing-grace', title: 'Amazing Grace', artist: 'John Newton', key: 'G', source: 'WorshipChordBook', license: 'Public Domain' }] });
      if (path === '/api/songs/public-catalog/amazing-grace') return Promise.resolve({ title: 'Amazing Grace', content: '{title: Amazing Grace}\n{key: G}\n{x_language: en}\n\n[G]Amazing grace' });
      return Promise.resolve({ songs: [] });
    });
  });

  it('shows popular open songs before the user searches', async () => {
    render(<SongSearchModal onImport={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: /popular songs/i })).toBeInTheDocument();
    expect(screen.getByText('Amazing Grace')).toBeInTheDocument();
    expect(screen.getByText('Popular')).toBeInTheDocument();
  });

  it('searches the open catalog and imports a selected chart without copy/paste', async () => {
    const onImport = vi.fn();
    const onClose = vi.fn();
    render(<SongSearchModal onImport={onImport} onClose={onClose} />);
    await screen.findByText('Popular');
    fireEvent.change(screen.getByRole('searchbox', { name: /song title/i }), { target: { value: 'Amazing Grace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/Public Domain/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /use song/i }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(expect.stringContaining('[G]Amazing grace')));
    expect(onClose).toHaveBeenCalled();
  });
});
