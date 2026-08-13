import type { SongListItem } from '../types';
import { languageName } from '../lib/languages';

interface SongCardProps {
  song: SongListItem;
  isOwner?: boolean;
  onClick: () => void;
  onEdit?: () => void;
}

export function SongCard({ song, isOwner, onClick, onEdit }: SongCardProps) {
  return (
    <article className="song-card library-song-row">
      <div className="song-card-info">
        <button className="song-card-open" type="button" aria-label={`Open ${song.title} chart`} onClick={onClick}>
          <span className="song-card-title">{song.title}</span>
          {song.artist && <span className="song-card-meta">{song.artist}</span>}
        </button>
        {song.tags && (
          <div className="song-card-tags" aria-label="Song tags">
            {song.tags.split(',').map((tag) => (
              <span key={tag} className="badge badge-tag">
                {tag.trim()}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="song-card-performance" aria-label="Song performance details">
        {song.key && <span className="song-card-key">{song.key}</span>}
        {song.bpm && <span className="song-card-bpm">{song.bpm} BPM</span>}
        {song.language && (
          <span className="song-card-language" title={languageName(song.language)}>
            {song.language.toUpperCase()}
          </span>
        )}
        {song.version_count && song.version_count > 1 && (
          <span className="song-card-versions">{song.version_count} versions</span>
        )}
        {song.visibility === 'private' && (
          <span className="song-card-private" aria-label="Private">
            &#128274; Private
          </span>
        )}
        {isOwner && onEdit && (
          <button
            className="btn btn-ghost btn-sm song-card-edit"
            aria-label={`Edit ${song.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            Edit
          </button>
        )}
      </div>
    </article>
  );
}
