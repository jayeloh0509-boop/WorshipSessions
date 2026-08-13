import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SetlistEntryCard } from '../SetlistEntryCard';
import type { SetlistEntry } from '../../types';

const entry: SetlistEntry = {
  entry_id: 11,
  song_id: 7,
  title: 'Goodness of God',
  artist: 'Bethel Music',
  content: '{key: G}\n[G]I love You Lord',
  content_override: null,
  performance_key: 'Ab',
  song_notes: 'Keys intro. Drums enter verse 2.',
  transition_notes: 'Hold the final pad into prayer.',
  transpose: 1,
  nashville: 0,
  font: null,
  two_col: null,
  bpm: 63,
  youtube_url: null,
  language: 'en',
};

describe('SetlistEntryCard preparation', () => {
  it('shows saved preparation details and submits edits', async () => {
    const onSavePreparation = vi.fn().mockResolvedValue(undefined);
    render(
      <SetlistEntryCard
        entry={entry}
        idx={0}
        isEditable
        isLocal={false}
        onRemove={vi.fn()}
        onTranspose={vi.fn()}
        onClick={vi.fn()}
        onSavePreparation={onSavePreparation}
        t={(key) => key}
      />,
    );

    expect(screen.getByText(/Performance key Ab/i)).toBeInTheDocument();
    expect(screen.getByText(/Keys intro/i)).toBeInTheDocument();
    expect(screen.getByText(/Hold the final pad/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTitle(/prepare song/i));
    fireEvent.change(screen.getByLabelText(/performance key/i), { target: { value: 'Bb' } });
    fireEvent.change(screen.getByLabelText(/^song notes/i), { target: { value: 'Acoustic intro' } });
    fireEvent.click(screen.getByRole('button', { name: /save preparation/i }));

    await waitFor(() =>
      expect(onSavePreparation).toHaveBeenCalledWith(11, 0, {
        performance_key: 'Bb',
        song_notes: 'Acoustic intro',
        transition_notes: 'Hold the final pad into prayer.',
      }),
    );
  });
});
