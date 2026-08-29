import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Mock } from 'vitest';
import { SetlistPlayView } from '../SetlistPlayView';
import { useSetlistPlayer } from '../../hooks/useSetlistPlayer';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('../../lib/chords', async () => {
  const actual = await vi.importActual('../../lib/chords');
  return {
    ...actual,
    autoFit: vi.fn().mockReturnValue({ fontSize: -1, twoCol: true }),
    renderChordPro: vi.fn().mockReturnValue('<div id="chord-output">Song Content</div>'),
  };
});

vi.mock('../../hooks/useSetlistPlayer', () => ({
  useSetlistPlayer: vi.fn(),
}));

vi.mock('../../hooks/useApi', () => ({
  useApi: () => vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

vi.mock('../../context/I18nContext', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => vi.fn(),
}));

vi.mock('../../hooks/useSwipe', () => ({
  useSwipe: vi.fn(),
}));

describe('SetlistPlayView', () => {
  const navigate = vi.fn();
  const mockUpdateEntry = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    localStorage.removeItem('worshipsessions-live-mode');
    localStorage.removeItem('worshipsessions-autoscroll-speed');
    (useSetlistPlayer as Mock).mockReturnValue({
      setlist: {
        id: 1,
        title: 'Test Setlist',
        entries: [
          { entry_id: 1, title: 'Song 1', content: 'C G' },
          { entry_id: 2, title: 'Song 2', content: 'D A' },
        ],
      },
      entry: { entry_id: 1, title: 'Song 1', content: 'C G', transpose: 0 },
      index: 0,
      total: 2,
      goTo: vi.fn(),
      prev: vi.fn(),
      next: vi.fn(),
      exit: vi.fn(),
      updateEntry: mockUpdateEntry,
      isModified: false,
      saveOnline: vi.fn(),
      saveLocal: vi.fn(),
    });
  });

  it('performs a one-time Auto-fit action', async () => {
    render(<SetlistPlayView setlistId={1} navigate={navigate} />);

    const fitBtn = screen.getByTitle(/Auto-fit for this screen/);
    fireEvent.click(fitBtn);

    // Button should briefly show "active" class
    expect(fitBtn).toHaveClass('active');

    // After timeout it should be back to OFF
    await waitFor(() => expect(fitBtn).not.toHaveClass('active'), { timeout: 2000 });
    expect(mockUpdateEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        _font: expect.any(Number),
      }),
    );
  });

  it('enters distraction-free Live Mode and requests a wake lock', async () => {
    const request = vi.fn().mockResolvedValue({ release: vi.fn(), addEventListener: vi.fn() });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });

    render(<SetlistPlayView setlistId={1} navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: /start live mode/i }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    expect(screen.getByTestId('setlist-play-container')).toHaveClass('live-mode');
    const viewport = screen.getByTestId('live-mode-chart-viewport');
    expect(viewport).toHaveClass('active');
    expect(screen.getByTestId('setlist-play-container')).toHaveStyle('overflow: hidden');
    expect(screen.getByRole('button', { name: /show controls/i })).toBeInTheDocument();
    const exits = screen.getAllByRole('button', { name: 'Exit Live Mode' });
    expect(exits[0]).toBeVisible();
    fireEvent.click(exits[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: /start live mode/i })).toBeInTheDocument());
  });

  it('reveals the toolbar while Live Mode is active', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn().mockResolvedValue({ release: vi.fn(), addEventListener: vi.fn() }) },
    });

    render(<SetlistPlayView setlistId={1} navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: /start live mode/i }));
    fireEvent.click(await screen.findByRole('button', { name: /show controls/i }));

    expect(screen.getByRole('button', { name: /hide controls/i })).toBeInTheDocument();
    expect(screen.getByTitle(/Auto-fit for this screen/)).toBeInTheDocument();
  });

  it('keeps next-song navigation available in Live Mode', async () => {
    const next = vi.fn();
    (useSetlistPlayer as Mock).mockReturnValue({
      setlist: { id: 1, title: 'Test Setlist', entries: [{ entry_id: 1 }, { entry_id: 2 }] },
      entry: { entry_id: 1, title: 'Song 1', content: 'C G', transpose: 0 },
      index: 0,
      total: 2,
      goTo: vi.fn(),
      prev: vi.fn(),
      next,
      exit: vi.fn(),
      updateEntry: mockUpdateEntry,
      isModified: false,
      saveOnline: vi.fn(),
      saveLocal: vi.fn(),
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn().mockResolvedValue({ release: vi.fn(), addEventListener: vi.fn() }) },
    });

    render(<SetlistPlayView setlistId={1} navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: /start live mode/i }));
    fireEvent.click(await screen.findByRole('button', { name: /next song/i }));

    expect(next).toHaveBeenCalledOnce();
  });

  it('starts, pauses, and persists Live Mode auto-scroll controls', async () => {
    localStorage.removeItem('worshipsessions-autoscroll-speed');
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn().mockResolvedValue({ release: vi.fn(), addEventListener: vi.fn() }) },
    });

    render(<SetlistPlayView setlistId={1} navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: /start live mode/i }));

    expect(screen.getByRole('button', { name: /show auto-scroll controls/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show auto-scroll controls/i }));
    expect(screen.getByRole('button', { name: /hide auto-scroll controls/i })).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: /auto-scroll speed/i });
    expect(slider).toHaveAttribute('min', '1');
    expect(slider).toHaveAttribute('max', '10');
    fireEvent.change(slider, { target: { value: '5' } });
    expect(slider).toHaveValue('5');
    expect(localStorage.getItem('worshipsessions-autoscroll-speed')).toBe('5');
    fireEvent.click(screen.getByRole('button', { name: /hide auto-scroll controls/i }));
    fireEvent.click(screen.getByRole('button', { name: /show auto-scroll controls/i }));
    const start = await screen.findByRole('button', { name: /start auto-scroll/i });
    fireEvent.click(start);

    const faster = screen.getByRole('button', { name: /increase auto-scroll speed/i });
    fireEvent.click(faster);
    fireEvent.click(faster);
    expect(localStorage.getItem('worshipsessions-autoscroll-speed')).toBe('7');

    fireEvent.keyDown(document, { key: ' ' });
    expect(screen.getByRole('button', { name: /start auto-scroll/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('pauses auto-scroll when changing songs', async () => {
    const next = vi.fn();
    (useSetlistPlayer as Mock).mockReturnValue({
      setlist: { id: 1, title: 'Test Setlist', entries: [{ entry_id: 1 }, { entry_id: 2 }] },
      entry: { entry_id: 1, title: 'Song 1', content: 'C G', transpose: 0 },
      index: 0,
      total: 2,
      goTo: vi.fn(),
      prev: vi.fn(),
      next,
      exit: vi.fn(),
      updateEntry: mockUpdateEntry,
      isModified: false,
      saveOnline: vi.fn(),
      saveLocal: vi.fn(),
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn().mockResolvedValue({ release: vi.fn(), addEventListener: vi.fn() }) },
    });

    render(<SetlistPlayView setlistId={1} navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: /start live mode/i }));
    fireEvent.click(await screen.findByRole('button', { name: /show auto-scroll controls/i }));
    fireEvent.click(screen.getByRole('button', { name: /start auto-scroll/i }));
    fireEvent.click(screen.getByRole('button', { name: /next song/i }));

    expect(next).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /start auto-scroll/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows song and transition notes during playback', () => {
    (useSetlistPlayer as Mock).mockReturnValue({
      setlist: { id: 1, title: 'Test Setlist', entries: [] },
      entry: {
        entry_id: 1,
        title: 'Song 1',
        content: 'C G',
        transpose: 0,
        song_notes: 'Start with acoustic guitar.',
        transition_notes: 'Hold the final chord into prayer.',
      },
      index: 0,
      total: 1,
      goTo: vi.fn(),
      prev: vi.fn(),
      next: vi.fn(),
      exit: vi.fn(),
      updateEntry: mockUpdateEntry,
      isModified: false,
      saveOnline: vi.fn(),
      saveLocal: vi.fn(),
    });

    render(<SetlistPlayView setlistId={1} navigate={navigate} />);

    expect(screen.getByRole('complementary', { name: /song preparation notes/i })).toHaveTextContent(
      'Start with acoustic guitar.',
    );
    expect(screen.getByRole('complementary', { name: /song preparation notes/i })).toHaveTextContent(
      'Hold the final chord into prayer.',
    );
  });
});
