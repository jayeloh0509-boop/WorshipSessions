import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetlistsView } from '../SetlistsView';
import { PublicSetlistsView } from '../PublicSetlistsView';

const apiCall = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useApi', () => ({ useApi: () => apiCall }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'owner', role: 'owner', token: 'token' } }),
}));
vi.mock('../../context/I18nContext', () => ({
  useI18n: () => ({ t: (_key: string, fallback?: string) => fallback || _key }),
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toast }));

const cloudSetlist = {
  id: 9,
  name: 'Sunday Setlist',
  visibility: 'public',
  song_count: 4,
  event_date: '2026-11-22',
  username: 'owner',
};

describe('Studio setlist collection surfaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    apiCall.mockImplementation((_method: string, path: string) => {
      if (path.startsWith('/api/setlists/public')) {
        return Promise.resolve({ setlists: [cloudSetlist], page: 1, totalPages: 1, total: 1, limit: 20 });
      }
      return Promise.resolve({ setlists: [cloudSetlist], page: 1, totalPages: 1, total: 1, limit: 20 });
    });
  });

  it('gives my setlists a Studio hierarchy and keeps sibling row actions', async () => {
    const navigate = vi.fn();
    const { container } = render(<SetlistsView navigate={navigate} />);

    const heading = await screen.findByRole('heading', { name: 'setlist.title', level: 1 });
    const page = heading.closest('.studio-page');
    expect(page).toHaveClass('studio-setlists');
    expect(screen.getByText('Prepare the flow. Leave room for the moment.')).toBeInTheDocument();

    const row = await screen.findByRole('button', { name: 'Open Sunday Setlist setlist' });
    expect(row).toBeInTheDocument();
    // Row actions stay siblings of the open control, never nested buttons.
    expect(container.querySelector('button button')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Prepare Sunday Setlist' }));
    expect(navigate).toHaveBeenCalledWith('setlist-edit', { id: '9' });
    await userEvent.click(screen.getByRole('button', { name: 'Play Sunday Setlist' }));
    expect(navigate).toHaveBeenCalledWith('setlist-play', { id: '9' });
  });

  it('keeps the public setlist surface read-only while adopting the Studio hierarchy', async () => {
    const navigate = vi.fn();
    render(<PublicSetlistsView navigate={navigate} />);

    const heading = await screen.findByRole('heading', { name: 'setlist.browseSetlists', level: 1 });
    expect(heading.closest('.studio-page')).toHaveClass('studio-setlists');
    expect(screen.getByText('Explore arrangements shared by the community.')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Sunday Setlist setlist' })).toBeInTheDocument());
    // No edit/prepare/play affordances leak into the read-only shared list.
    expect(screen.queryByRole('button', { name: 'Prepare Sunday Setlist' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Duplicate Sunday Setlist' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play Sunday Setlist' })).toBeNull();
  });
});
