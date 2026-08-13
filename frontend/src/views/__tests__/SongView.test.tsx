import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SongView } from '../SongView';

const apiCall = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useApi', () => ({ useApi: () => apiCall }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'owner', role: 'user', token: 'token' } }),
}));
vi.mock('../../context/I18nContext', () => ({
  useI18n: () => ({ t: (_key: string, fallback?: string) => fallback || 'Back' }),
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('../../hooks/useChordRenderer', () => ({
  useChordRenderer: () => ({
    transpose: 0,
    nashville: false,
    currentKey: 'Ab',
    setTranspose: vi.fn(),
    setNashville: vi.fn(),
    doTranspose: vi.fn(),
    resetTranspose: vi.fn(),
    toggleNashville: vi.fn(),
    pickKey: vi.fn(),
  }),
}));
vi.mock('../../hooks/useFontScale', () => ({
  useFontScale: () => ({ fontSize: 0, changeFontSize: vi.fn(), resetFontSize: vi.fn() }),
}));
vi.mock('../../hooks/useTwoCol', () => ({
  useTwoCol: () => ({ twoCol: false, toggleTwoCol: vi.fn(), setTwoColTo: vi.fn() }),
}));
vi.mock('../../hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock('../../lib/chords', () => ({
  renderChordPro: () => '<div class="chord-sheet"><div class="label">VERSE 1</div></div>',
  songHasKey: () => true,
  autoFit: () => ({ fontSize: 0, twoCol: false }),
}));
vi.mock('../../components/Toolbar', () => ({
  Toolbar: ({ currentKey }: { currentKey: string }) => <div data-testid="reading-controls">Controls {currentKey}</div>,
}));
vi.mock('../../components/ChordSheet', () => ({
  ChordSheet: ({ tone }: { tone?: string }) => <div data-testid="chart-surface" data-tone={tone} />,
}));
vi.mock('../../components/Loading', () => ({ Loading: () => <div>Loading</div> }));
vi.mock('../../components/AddToSetlistModal', () => ({ AddToSetlistModal: () => null }));

const song = {
  id: 7,
  title: 'Goodness of God',
  artist: 'Bethel Music',
  content: '{key: Ab}\nVERSE 1\n[Ab]I love You Lord',
  visibility: 'private',
  youtube_url: null,
  bpm: 63,
  tags: 'worship,slow',
  language: 'en',
  format_detected: 'chordpro',
  username: 'owner',
  user_id: 1,
  parent_id: null,
  status: 'active',
  created_at: '2026-08-13',
  updated_at: '2026-08-13',
};

describe('SongView chord-reading workspace', () => {
  it('prioritizes performance metadata and uses a paper chart surface', async () => {
    apiCall.mockImplementation((_method: string, path: string) => {
      if (path.endsWith('/versions')) return Promise.resolve([]);
      if (path.endsWith('/corrections')) return Promise.resolve([]);
      return Promise.resolve(song);
    });

    render(<SongView songId={7} navigate={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Goodness of God', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Bethel Music', { selector: '.lead-sheet-heading p' })).toBeInTheDocument();
    expect(screen.getByText('Ab', { selector: '.lead-sheet-key-value' })).toBeInTheDocument();
    expect(screen.getByText('63', { selector: '.lead-sheet-tempo-value' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Song actions' })).toBeInTheDocument();
    expect(screen.getByTestId('reading-controls')).toBeInTheDocument();
    expect(screen.getByTestId('chart-surface')).toHaveAttribute('data-tone', 'paper');
    expect(screen.getByRole('region', { name: 'Goodness of God chord chart' })).toHaveClass('lead-sheet-document');
    expect(screen.getByRole('navigation', { name: 'Song sections' })).toBeInTheDocument();

    await waitFor(() => expect(apiCall).toHaveBeenCalledWith('GET', '/api/songs/7/versions'));
  });
});
