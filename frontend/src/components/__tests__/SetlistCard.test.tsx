import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SetlistCard } from '../SetlistCard';

vi.mock('../../context/I18nContext', () => ({
  useI18n: () => ({ t: (_key: string, fallback?: string) => fallback || _key }),
}));

const setlist = {
  id: 4,
  name: 'Sunday Morning',
  song_count: 5,
  visibility: 'private',
  event_date: '2026-08-16',
  updated_at: undefined,
  username: 'jaye',
};

describe('SetlistCard preparation row', () => {
  it('separates preparation from playback and exposes the setlist identity', () => {
    render(<SetlistCard setlist={setlist} onClick={vi.fn()} onPrepare={vi.fn()} onPlay={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Open Sunday Morning setlist' })).toBeInTheDocument();
    expect(screen.getByText(/5 songs/)).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prepare Sunday Morning' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Sunday Morning' })).toBeInTheDocument();
  });
});
