import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SongView } from '../SongView';

const apiCall = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
const authUser = vi.hoisted(() => ({ id: 1, username: 'owner', role: 'user', token: 'token' }));
const translate = vi.hoisted(() => (_key: string, fallback?: string) => fallback || 'Back');
const chordActions = vi.hoisted(() => ({
  setTranspose: vi.fn(),
  setNashville: vi.fn(),
  doTranspose: vi.fn(),
  resetTranspose: vi.fn(),
  toggleNashville: vi.fn(),
  pickKey: vi.fn(),
}));

vi.mock('../../hooks/useApi', () => ({ useApi: () => apiCall }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: authUser }),
}));
vi.mock('../../context/I18nContext', () => ({
  useI18n: () => ({ t: translate }),
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../../hooks/useChordRenderer', () => ({
  useChordRenderer: () => ({
    transpose: 0,
    nashville: false,
    currentKey: 'Ab',
    ...chordActions,
  }),
}));
vi.mock('../../hooks/useFontScale', () => ({
  useFontScale: () => ({ fontSize: 0, changeFontSize: vi.fn(), resetFontSize: vi.fn() }),
}));
vi.mock('../../hooks/useTwoCol', () => ({
  useTwoCol: () => ({ twoCol: false, toggleTwoCol: vi.fn(), setTwoColTo: vi.fn() }),
}));
vi.mock('../../hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock('../../lib/chords', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/chords')>();
  return {
    ...actual,
    renderChordPro: () => '<div class="chord-sheet"><div class="label">VERSE 1</div></div>',
    songHasKey: () => true,
    autoFit: () => ({ fontSize: 0, twoCol: false }),
  };
});
vi.mock('../../components/Toolbar', () => ({
  Toolbar: (props: {
    currentKey: string;
    onTwoColToggle?: () => void;
    onFontChange?: (delta: number) => void;
    onReset?: () => void;
    onAutoFit?: () => void;
    onChartToneChange?: () => void;
  }) => (
    <div data-testid="reading-controls">
      Controls {props.currentKey}
      <button aria-label="test two columns" onClick={props.onTwoColToggle} />
      <button aria-label="test larger font" onClick={() => props.onFontChange?.(1)} />
      <button aria-label="test reset" onClick={props.onReset} />
      <button aria-label="test auto fit" onClick={props.onAutoFit} />
      <button aria-label="test tone" onClick={props.onChartToneChange} />
    </div>
  ),
}));
vi.mock('../../components/ChordSheet', () => ({
  ChordSheet: ({ tone }: { tone?: string }) => <div data-testid="chart-surface" data-tone={tone} />,
}));
vi.mock('../../components/MusicianTools', () => ({
  MusicianTools: (props: {
    chords: string[];
    bpm?: number | null;
    simplified: boolean;
    onSimplifiedChange: (value: boolean) => void;
  }) => (
    <div data-testid="musician-tools" data-chords={props.chords.join(',')} data-bpm={props.bpm}>
      <button aria-label="test simplify" onClick={() => props.onSimplifiedChange(!props.simplified)} />
    </div>
  ),
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

    expect(await screen.findByRole('heading', { name: 'Goodness of God', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Bethel Music', { selector: '.song-view-artist' })).toBeInTheDocument();
    expect(screen.getByText('Ab', { selector: '.song-view-key-value' })).toBeInTheDocument();
    expect(screen.getByText('63 BPM', { selector: '.song-view-stat' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Song actions' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show chart controls' }));
    expect(screen.getByTestId('reading-controls')).toBeInTheDocument();
    expect(screen.getByLabelText('Chart display modes')).toHaveTextContent('ChordsNumbers');
    expect(screen.getByTestId('musician-tools')).toHaveAttribute('data-chords', 'Ab');
    expect(screen.getByTestId('musician-tools')).toHaveAttribute('data-bpm', '63');
    fireEvent.click(screen.getByRole('button', { name: 'test simplify' }));
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('cv_song_reading_preferences_v1') || '{}')).toMatchObject({
        7: { simplified: true },
      });
    });
    expect(screen.getByTestId('chart-surface')).toHaveAttribute('data-tone', 'paper');
    expect(screen.getByRole('region', { name: 'Chord chart' })).toHaveClass('chart-reading-surface');
    expect(screen.getByRole('button', { name: 'Start song auto-scroll' })).toBeInTheDocument();
    expect(screen.queryByText('WorshipSessions · Lead Sheet')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Song sections' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'test larger font' }));
    fireEvent.click(screen.getByRole('button', { name: 'test tone' }));
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('cv_song_reading_preferences_v1') || '{}')).toMatchObject({
        7: { fontSize: 1, chartTone: 'dark' },
      });
    });

    await waitFor(() => expect(apiCall).toHaveBeenCalledWith('GET', '/api/songs/7/versions'));
  });

  it('includes extended imported section labels in the roadmap', async () => {
    apiCall.mockImplementation((_method: string, path: string) => {
      if (path.endsWith('/versions')) return Promise.resolve([]);
      if (path.endsWith('/corrections')) return Promise.resolve([]);
      return Promise.resolve({
        ...song,
        content: '{key: Bb}\nHalf-Chorus\n[Bb]One\nVamp\n[Eb]Two\nAlt Verse 1\n[F]Three\nREPEAT VERSE 1',
      });
    });

    render(<SongView songId={7} navigate={vi.fn()} />);

    const roadmap = await screen.findByRole('navigation', { name: 'Song sections' });
    expect(roadmap).toHaveTextContent('Half-Chorus');
    expect(roadmap).toHaveTextContent('Vamp');
    expect(roadmap).toHaveTextContent('Alt Verse 1');
    expect(roadmap).toHaveTextContent('REPEAT VERSE 1');
  });
});
