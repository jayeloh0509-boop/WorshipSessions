import type { SongListItem } from '../types';

interface LibrarySongRowProps {
  song: SongListItem;
  onOpen: () => void;
  onEdit?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

/** One song-row presentation for the shared and personal libraries. */
export function LibrarySongRow({ song, onOpen, onEdit, isFavorite = false, onToggleFavorite }: LibrarySongRowProps) {
  const tags = song.tags?.split(',').map((tag) => tag.trim()).filter(Boolean).join(' · ');
  return (
    <article className={`clean-library-row${!onEdit && !onToggleFavorite ? ' clean-library-row--compact' : ''}`} role="listitem">
      <button type="button" className="clean-library-open" aria-label={`Open ${song.title} chart`} onClick={onOpen}>
        <span className="clean-library-song-title">{song.title}</span>
        <span className="clean-library-song-artist">{song.artist || 'Unknown artist'}</span>
        <span className="studio-song-details">
          {[song.bpm ? `${song.bpm} BPM` : null, song.language?.toUpperCase(), tags,
            song.version_count && song.version_count > 1 ? `${song.version_count} versions` : null,
            song.visibility === 'private' ? 'Private' : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </button>
      {onToggleFavorite && (
        <button
          type="button"
          className={`clean-library-favorite${isFavorite ? ' active' : ''}`}
          aria-label={`${isFavorite ? 'Remove' : 'Add'} ${song.title} ${isFavorite ? 'from' : 'to'} Favorites`}
          aria-pressed={isFavorite}
          onClick={onToggleFavorite}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      )}
      {onEdit && (
        <button
          type="button"
          className="clean-library-edit"
          aria-label={`Edit ${song.title}; BPM, language, and tags`}
          title="Edit BPM, language, and tags"
          onClick={onEdit}
        >
          Edit
        </button>
      )}
      <button
        type="button"
        className="clean-library-key"
        aria-label={`Open ${song.title} chart in key ${song.key || 'not set'}`}
        onClick={onOpen}
      >
        {song.key || '—'}
      </button>
    </article>
  );
}
