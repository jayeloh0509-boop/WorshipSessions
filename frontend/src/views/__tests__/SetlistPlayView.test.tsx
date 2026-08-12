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

vi.mock('../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

describe('SetlistPlayView', () => {
  const navigate = vi.fn();
  const mockUpdateEntry = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('worshipsessions-live-mode');
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
    expect(screen.getByRole('button', { name: /show controls/i })).toBeInTheDocument();
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
});
