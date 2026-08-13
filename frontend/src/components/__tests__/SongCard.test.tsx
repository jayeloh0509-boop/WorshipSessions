import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SongCard } from '../SongCard';

const song = {
  id: 7,
  title: 'Goodness of God',
  artist: 'Bethel Music',
  key: 'Ab',
  bpm: 63,
  tags: 'worship,slow',
  language: 'en',
  visibility: 'private',
  username: 'owner',
  version_count: 2,
};

describe('SongCard library row', () => {
  it('makes the chart identity and performance metadata scannable', () => {
    render(<SongCard song={song} isOwner onClick={vi.fn()} onEdit={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Open Goodness of God chart' })).toBeInTheDocument();
    expect(screen.getByText('Bethel Music')).toBeInTheDocument();
    expect(screen.getByText('Ab', { selector: '.song-card-key' })).toBeInTheDocument();
    expect(screen.getByText('63 BPM')).toBeInTheDocument();
    expect(screen.getByLabelText('Private')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Goodness of God' })).toBeInTheDocument();
  });
});
