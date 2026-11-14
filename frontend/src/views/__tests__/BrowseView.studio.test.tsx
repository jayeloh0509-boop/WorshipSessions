import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowseView } from '../BrowseView';

const mockApiCall = vi.fn();
const mockToast = vi.fn();
const mockUser = { id: 1, username: 'testuser' };

vi.mock('../../hooks/useApi', () => ({ useApi: () => mockApiCall }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock('../../context/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) =>
      ({ 'songs.search': 'Search', 'songs.searchPlaceholder': 'Search title or artist…' })[key] ?? fallback ?? key,
  }),
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => mockToast }));
vi.mock('../../lib/storage', () => ({
  getSessionItem: () => null,
  setSessionItem: vi.fn(),
}));

describe('BrowseView Studio library', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiCall.mockResolvedValue({
      songs: [{ id: 7, title: 'Bright Horizon', artist: 'Common Ground', key: 'E', bpm: 116, language: 'en', tags: 'worship,live', version_count: 2 }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('presents an accessible Studio hierarchy and keeps search/filter behavior', async () => {
    const navigate = vi.fn();
    render(<BrowseView navigate={navigate} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Songs' })).toBeInTheDocument();
    expect(screen.getByText('THE SHARED LIBRARY')).toBeInTheDocument();
    expect(screen.getByLabelText('Search songs by title or artist')).toBeInTheDocument();

    const openSong = await screen.findByRole('button', { name: 'Open Bright Horizon chart' });
    expect(openSong.closest('.clean-library-row')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Bright Horizon chart in key E' })).toBeInTheDocument();
    expect(document.querySelector('.studio-browse')).toHaveClass('song-library-premium-preview');
    expect(document.querySelector('.studio-browse .clean-library-search')).toBeInTheDocument();
    expect(screen.getByText('1 songs · Page 1 of 1')).toBeInTheDocument();
    expect(openSong.closest('.clean-library-row')).toHaveClass('clean-library-row--compact');
    expect(screen.getByText(/worship · live/)).toBeInTheDocument();
    expect(screen.getByText(/2 versions/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search songs by title or artist'), { target: { value: 'horizon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search songs' }));
    await waitFor(() => expect(mockApiCall).toHaveBeenCalledWith('GET', '/api/songs/public?q=horizon&page=1&limit=20'));
  });

  it('submits an Enter search only once through its form', async () => {
    render(<BrowseView navigate={vi.fn()} />);
    await screen.findByRole('button', { name: 'Open Bright Horizon chart' });
    const input = screen.getByLabelText('Search songs by title or artist');
    fireEvent.change(input, { target: { value: 'horizon' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(mockApiCall).toHaveBeenCalledTimes(2));
  });
});
