import { render, screen, within } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { SongQueue } from '../SongQueue';
import type { SetlistEntry } from '../../types/setlist';

function makeEntry(overrides: Partial<SetlistEntry>): SetlistEntry {
  return {
    entry_id: 1,
    song_id: 1,
    title: 'Song',
    artist: '',
    content: '',
    content_override: null,
    transpose: 0,
    nashville: 0,
    font: null,
    two_col: null,
    bpm: null,
    youtube_url: null,
    language: 'en',
    ...overrides,
  };
}

describe('SongQueue', () => {
  it('renders nothing for a single-song setlist', () => {
    const { container } = render(
      <SongQueue entries={[makeEntry({ entry_id: 1, title: 'Only Song' })]} currentIndex={0} onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an empty setlist', () => {
    const { container } = render(<SongQueue entries={[]} currentIndex={0} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks the current song as "Now" and the following song as "Next"', () => {
    const entries = [
      makeEntry({ entry_id: 1, title: 'First Song' }),
      makeEntry({ entry_id: 2, title: 'Second Song' }),
      makeEntry({ entry_id: 3, title: 'Third Song' }),
    ];
    render(<SongQueue entries={entries} currentIndex={0} onSelect={vi.fn()} />);

    const items = screen.getAllByRole('button');
    expect(items).toHaveLength(3);

    expect(within(items[0]).getByText('Now')).toBeInTheDocument();
    expect(items[0]).toHaveClass('current');
    expect(items[0]).toHaveAttribute('aria-current', 'true');

    expect(within(items[1]).getByText('Next')).toBeInTheDocument();
    expect(items[1]).toHaveClass('upcoming');
    expect(items[1]).not.toHaveAttribute('aria-current');

    expect(within(items[2]).queryByText('Now')).not.toBeInTheDocument();
    expect(within(items[2]).queryByText('Next')).not.toBeInTheDocument();
    expect(items[2]).not.toHaveClass('current');
    expect(items[2]).not.toHaveClass('upcoming');
  });

  it('shows no "Next" tag when the current song is the last in the queue', () => {
    const entries = [makeEntry({ entry_id: 1, title: 'First' }), makeEntry({ entry_id: 2, title: 'Last' })];
    render(<SongQueue entries={entries} currentIndex={1} onSelect={vi.fn()} />);

    const items = screen.getAllByRole('button');
    expect(within(items[1]).getByText('Now')).toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('renders repeated songs as distinct entries keyed by entry_id, each independently taggable', () => {
    const entries = [
      makeEntry({ entry_id: 'a', title: 'Amazing Grace' }),
      makeEntry({ entry_id: 'b', title: 'Interlude' }),
      makeEntry({ entry_id: 'c', title: 'Amazing Grace' }),
    ];
    render(<SongQueue entries={entries} currentIndex={2} onSelect={vi.fn()} />);

    const matches = screen.getAllByTitle('Amazing Grace');
    expect(matches).toHaveLength(2);
    expect(matches[0]).not.toHaveClass('current');
    expect(matches[1]).toHaveClass('current');
  });

  it('falls back to a positional label when a song has no title', () => {
    const entries = [makeEntry({ entry_id: 1, title: '' }), makeEntry({ entry_id: 2, title: 'Second' })];
    render(<SongQueue entries={entries} currentIndex={0} onSelect={vi.fn()} />);

    expect(screen.getByTitle('Song 1')).toBeInTheDocument();
  });

  it('invokes onSelect with the clicked index, including for the current song', () => {
    const onSelect = vi.fn();
    const entries = [
      makeEntry({ entry_id: 1, title: 'First' }),
      makeEntry({ entry_id: 2, title: 'Second' }),
      makeEntry({ entry_id: 3, title: 'Third' }),
    ];
    render(<SongQueue entries={entries} currentIndex={0} onSelect={onSelect} />);

    fireEvent.click(screen.getByTitle('Third'));
    expect(onSelect).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByTitle('First'));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('exposes an accessible list structure without overriding the button role', () => {
    const entries = [makeEntry({ entry_id: 1, title: 'First' }), makeEntry({ entry_id: 2, title: 'Second' })];
    render(<SongQueue entries={entries} currentIndex={0} onSelect={vi.fn()} />);

    const list = screen.getByRole('list', { name: /song queue/i });
    const listItems = within(list).getAllByRole('listitem');
    expect(listItems).toHaveLength(2);
    // Each list item must contain a real <button>, not a div masquerading as one.
    listItems.forEach((li) => {
      expect(within(li).getByRole('button')).toBeInstanceOf(HTMLButtonElement);
    });
  });
});
