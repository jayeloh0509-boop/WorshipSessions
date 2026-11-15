import type { SetlistListItem } from '../types';
import { useI18n } from '../context/I18nContext';

interface SetlistCardProps {
  setlist: SetlistListItem;
  onClick: () => void;
  onPrepare?: () => void;
  onPlay?: () => void;
  onDuplicate?: () => void;
  showUsername?: boolean;
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function dateBadgeParts(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const day = String(d.getDate()).padStart(2, '0');
  const days = daysUntil(dateStr);
  let countdown = '';
  let kind: 'today' | 'soon' | 'later' | 'past' = 'later';
  if (days === 0) {
    countdown = 'Today';
    kind = 'today';
  } else if (days !== null && days > 0) {
    countdown = days === 1 ? 'Tomorrow' : `in ${days} days`;
    kind = days <= 7 ? 'soon' : 'later';
  } else if (days !== null && days < 0) {
    const ago = Math.abs(days);
    countdown = ago === 1 ? 'Yesterday' : `${ago}d ago`;
    kind = 'past';
  }
  return { month, day, countdown, kind };
}

export function SetlistCard({ setlist, onClick, onPrepare, onPlay, onDuplicate, showUsername }: SetlistCardProps) {
  const { t } = useI18n();
  const badge = dateBadgeParts(setlist.event_date);
  const songLabel = `${setlist.song_count} ${setlist.song_count !== 1 ? t('admin.songPlural', 'songs') : t('admin.song', 'song')}`;
  const updated = !badge && setlist.updated_at ? new Date(setlist.updated_at).toLocaleDateString() : '';

  return (
    <article
      className={
        'song-card setlist-card library-setlist-row' +
        (badge ? ' setlist-card-dated' : '') +
        (badge?.kind === 'past' ? ' setlist-card-past' : '')
      }
    >
      <button className="setlist-card-open" type="button" aria-label={`Open ${setlist.name} setlist`} onClick={onClick}>
        {badge ? (
          <span className={`setlist-date-badge setlist-date-badge-${badge.kind}`} aria-hidden="true">
            <span className="setlist-date-badge-month">{badge.month}</span>
            <span className="setlist-date-badge-day">{badge.day}</span>
            <span className="setlist-date-badge-countdown">{badge.countdown}</span>
          </span>
        ) : (
          <span className="setlist-card-index" aria-hidden="true">
            ♫
          </span>
        )}
        <span className="song-card-info">
          <span className="song-card-title">{setlist.name}</span>
          <span className="song-card-meta">
            {showUsername && setlist.username && `@${setlist.username} · `}
            <span className="setlist-card-song-count">{songLabel}</span>
            {!badge && updated && ` · ${updated}`}
            {setlist.visibility === 'public' && badge && (
              <span className="setlist-visibility-chip" aria-label="Public setlist">Public</span>
            )}
          </span>
        </span>
      </button>
      <div className="setlist-card-actions">
        {onPrepare && (
          <button
            className="btn btn-ghost btn-sm setlist-action-secondary"
            aria-label={`Prepare ${setlist.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onPrepare();
            }}
          >
            Prepare
          </button>
        )}
        {onDuplicate && (
          <button
            className="btn btn-ghost btn-sm setlist-action-secondary"
            aria-label={`Duplicate ${setlist.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
          >
            Duplicate
          </button>
        )}
        {onPlay && setlist.song_count > 0 && (
          <button
            className="btn btn-sm setlist-play-button setlist-action-primary"
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
