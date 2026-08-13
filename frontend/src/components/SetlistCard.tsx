import type { SetlistListItem } from '../types';
import { useI18n } from '../context/I18nContext';

interface SetlistCardProps {
  setlist: SetlistListItem;
  onClick: () => void;
  onPrepare?: () => void;
  onPlay?: () => void;
  showUsername?: boolean;
}

export function SetlistCard({ setlist, onClick, onPrepare, onPlay, showUsername }: SetlistCardProps) {
  const { t } = useI18n();
  const date = setlist.event_date || (setlist.updated_at ? new Date(setlist.updated_at).toLocaleDateString() : '');
  const songLabel = `${setlist.song_count} ${setlist.song_count !== 1 ? t('admin.songPlural', 'songs') : t('admin.song', 'song')}`;

  return (
    <article className="song-card setlist-card library-setlist-row">
      <button className="setlist-card-open" type="button" aria-label={`Open ${setlist.name} setlist`} onClick={onClick}>
        <span className="setlist-card-index" aria-hidden="true">
          ♫
        </span>
        <span className="song-card-info">
          <span className="song-card-title">{setlist.name}</span>
          <span className="song-card-meta">
            {showUsername && setlist.username && `@${setlist.username} · `}
            {songLabel}
            {date && ` · ${date}`}
          </span>
        </span>
      </button>
      <div className="setlist-card-actions">
        {onPrepare && (
          <button
            className="btn btn-ghost btn-sm"
            aria-label={`Prepare ${setlist.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onPrepare();
            }}
          >
            Prepare
          </button>
        )}
        {onPlay && setlist.song_count > 0 && (
          <button
            className="btn btn-sm setlist-play-button"
            aria-label={`Play ${setlist.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
          >
            {t('setlist.play', 'Play')}
          </button>
        )}
      </div>
    </article>
  );
}
