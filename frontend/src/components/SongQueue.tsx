import type { SetlistEntry } from '../types';

interface SongQueueProps {
  entries: SetlistEntry[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function SongQueue({ entries, currentIndex, onSelect }: SongQueueProps) {
  if (entries.length < 2) return null;

  return (
    <div className="song-queue" role="list" aria-label="Song queue">
      {entries.map((queueEntry, idx) => {
        const isCurrent = idx === currentIndex;
        const isUpcoming = idx === currentIndex + 1;
        return (
          <div className="song-queue-list-item" role="listitem" key={queueEntry.entry_id}>
            <button
              type="button"
              className={`song-queue-item${isCurrent ? ' current' : ''}${isUpcoming ? ' upcoming' : ''}`}
              onClick={() => onSelect(idx)}
              aria-current={isCurrent ? 'true' : undefined}
              title={queueEntry.title || `Song ${idx + 1}`}
            >
              <span className="song-queue-index">{idx + 1}</span>
              <span className="song-queue-title">{queueEntry.title || `Song ${idx + 1}`}</span>
              {isCurrent && <span className="song-queue-tag">Now</span>}
              {isUpcoming && <span className="song-queue-tag">Next</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
