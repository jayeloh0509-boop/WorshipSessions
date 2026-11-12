import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MySongsView } from '../MySongsView';

const sampleSong = {
  id: 42,
  title: 'Hungry (Falling on My Knees)',
  artist: 'Kathryn Scott',
  key: 'C',
  bpm: 72,
  tags: 'worship,verified-import',
  language: 'en',
  visibility: 'private',
  username: 'testuser',
};
const pageResponse = { songs: [sampleSong], total: 1, page: 1, limit: 20, totalPages: 1 };
const mockApiCall = vi.fn();
const mockToast = vi.fn();
const mockUser = { id: 1, username: 'testuser' };
const translations: Record<string, string> = {
  'songs.mySongs': 'My Songs',
  'songs.searchPlaceholder': 'Search title or artist...',
  'songs.search': 'Search',
  'songs.newSong': 'New Song',
  'songs.noMatches': 'No songs match your search.',
  'songs.noSongs': 'No songs yet.',
  'songs.addFirst': 'Add your first song',
};
const mockT = (key: string) => translations[key] ?? key;

vi.mock('../../hooks/useApi', () => ({ useApi: () => mockApiCall }));
vi.mock('../../context/I18nContext', () => ({ useI18n: () => ({ t: mockT, loaded: true }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => mockToast }));
vi.mock('../../lib/storage', () => ({
  getSessionItem: () => null,
  setSessionItem: vi.fn(),
  getStoredUser: () => mockUser,
}));

describe('MySongsView Clean Charcoal preview', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockApiCall.mockImplementation((_method: string, path: string) =>
      Promise.resolve(
        path.includes('q=no-such-song') ? { songs: [], total: 0, page: 1, limit: 20, totalPages: 1 } : pageResponse,
      ),
    );
  });

  async function renderPreview() {
    render(<MySongsView navigate={navigate} compactPreview />);
    await screen.findByRole('button', { name: 'Open Hungry (Falling on My Knees) chart' });
  }

  it('keeps the long title scannable and exposes add, edit, chart, and metadata locations', async () => {
    const { container } = render(<MySongsView navigate={navigate} compactPreview />);
    await screen.findByRole('button', { name: 'Open Hungry (Falling on My Knees) chart' });
    expect(screen.getByText('Kathryn Scott')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Song' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Song' }).textContent?.match(/\+/g)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Search songs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit Hungry.*BPM, language, and tags/ })).toBeInTheDocument();
    expect(screen.queryByText('Key at right · Edit opens BPM, language, and tags.')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open Hungry (Falling on My Knees) chart in key C' }),
    ).toBeInTheDocument();
    expect(container.querySelector('.song-card')).toBeNull();
    expect(container.querySelector('.clean-library-pagination')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'New Song' }));
    expect(navigate).toHaveBeenCalledWith('song-edit');
    fireEvent.click(screen.getByRole('button', { name: /Edit Hungry.*BPM, language, and tags/ }));
    expect(navigate).toHaveBeenCalledWith('song-edit', { id: '42' });
    fireEvent.click(screen.getByRole('button', { name: 'Open Hungry (Falling on My Knees) chart' }));
    expect(navigate).toHaveBeenCalledWith('song-view', { id: '42' });
    expect(JSON.parse(localStorage.getItem('cv_recent_songs:1') || '[]')).toEqual([42]);
  });

  it('shows a no-results state and clears back to the list', async () => {
    await renderPreview();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search songs by title or artist' }), {
      target: { value: 'no-such-song' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search songs' }));
    expect(await screen.findByText('No songs match your search.')).toBeInTheDocument();
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/api/songs?q=no-such-song&page=1&limit=100');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByRole('button', { name: 'Open Hungry (Falling on My Knees) chart' })).toBeInTheDocument();
  });

  it('uses a distinct accessible filter control backed by the existing language query', async () => {
    await renderPreview();
    const toggle = screen.getByRole('button', { name: 'Filter songs' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Song filters' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'en' } });
    await waitFor(() => expect(mockApiCall).toHaveBeenCalledWith('GET', '/api/songs?language=en&page=1&limit=100'));
  });

  it('keeps Favorites and Recently Played functional in the compact view', async () => {
    await renderPreview();
    fireEvent.click(screen.getByRole('button', { name: 'Add Hungry (Falling on My Knees) to Favorites' }));
    fireEvent.click(screen.getByRole('tab', { name: /Favorites/ }));
    expect(screen.getByRole('button', { name: 'Open Hungry (Falling on My Knees) chart' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'All songs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Hungry (Falling on My Knees) chart' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Recently played' }));
    expect(screen.getByRole('button', { name: 'Open Hungry (Falling on My Knees) chart' })).toBeInTheDocument();
  });

  it('keeps the premium variant isolated and collapses its filter panel accessibly', async () => {
    const { container } = render(<MySongsView navigate={navigate} compactPreview previewVariant="premium" />);
    await screen.findByRole('button', { name: 'Open Hungry (Falling on My Knees) chart' });
    expect(container.querySelector('.song-library-premium-preview')).toBeInTheDocument();
    expect(container.querySelector('.clean-library-tab-indicator')).toBeInTheDocument();
    const filterToggle = screen.getByRole('button', { name: 'Filter songs' });
    fireEvent.click(filterToggle);
    expect(container.querySelector('.clean-library-filter-shell')).toHaveClass('open');
    fireEvent.click(filterToggle);
    expect(container.querySelector('.clean-library-filter-shell')).not.toHaveClass('open');
    expect(screen.getByLabelText('Language')).toBeDisabled();
  });

  it('loads the full result set before local tabs and resets pagination on search, filter, and tab changes', async () => {
    const firstPageSongs = Array.from({ length: 100 }, (_, index) => ({
      ...sampleSong,
      id: 1000 + index,
      title: `Catalog Song ${index + 1}`,
    }));
    const laterPageFavorite = { ...sampleSong, id: 9999, title: 'Later Page Favorite' };
    localStorage.setItem('cv_favorites:1', JSON.stringify([laterPageFavorite.id]));
    mockApiCall.mockImplementation((_method: string, path: string) => {
      const requestedPage = Number(/page=(\d+)/.exec(path)?.[1] || 1);
      return Promise.resolve({
        songs: requestedPage === 1 ? firstPageSongs : [laterPageFavorite],
        total: 101,
        page: requestedPage,
        limit: 100,
        totalPages: 2,
      });
    });

    const { container } = render(<MySongsView navigate={navigate} compactPreview />);
    await screen.findByRole('button', { name: 'Open Catalog Song 1 chart' });
    expect(container.querySelector('.clean-library-pagination')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(await screen.findByText('Page 2 of 6')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filter songs' }));
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'en' } });
    expect(await screen.findByText('Page 1 of 6')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(await screen.findByText('Page 2 of 6')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search songs by title or artist' }), {
      target: { value: 'later' },
    });
    expect(await screen.findByText('Page 1 of 6')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Favorites/ }));
    expect(await screen.findByRole('button', { name: 'Open Later Page Favorite chart' })).toBeInTheDocument();
    expect(screen.getByText('1 shown')).toBeInTheDocument();
    expect(container.querySelector('.clean-library-pagination')).toBeNull();
  });
});
