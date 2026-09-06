import { useEffect, useState } from 'react';
import { getSongKey } from '../lib/chords';
import type { SetlistEntry } from '../types';

interface SetlistEntryCardProps {
  entry: SetlistEntry;
  idx: number;
  isEditable: boolean;
  isLocal: boolean;
  onRemove: (entryId: number | string, idx: number) => void;
  onTranspose: (entryId: number | string, idx: number, delta: number) => void;
  onClick: (idx: number) => void;
  onSavePreparation: (
    entryId: number | string,
    idx: number,
    values: { performance_key: string; song_notes: string; transition_notes: string; arrangement_confirmed: boolean; key_confirmed: boolean; transition_rehearsed: boolean; chart_verified: boolean },
  ) => Promise<void>;
  t: (key: string) => string;
  dragProps?: React.HTMLProps<HTMLDivElement>;
  handleProps?: React.HTMLProps<HTMLDivElement>;
  isDragging?: boolean;
  sections?: { id: number | string; name: string }[];
  onSectionChange?: (idx: number, sectionId: string) => void;
}

export function SetlistEntryCard({
  entry,
  idx,
  isEditable,
  isLocal,
  onRemove,
  onTranspose,
  onClick,
  onSavePreparation,
  t,
  dragProps,
  handleProps,
  isDragging,
  sections = [],
  onSectionChange,
}: SetlistEntryCardProps) {
  const keyDisplay = getSongKey(entry.content_override || entry.content, entry.transpose);
  const [preparing, setPreparing] = useState(false);
  const [performanceKey, setPerformanceKey] = useState(entry.performance_key || keyDisplay || '');
  const [songNotes, setSongNotes] = useState(entry.song_notes || '');
  const [transitionNotes, setTransitionNotes] = useState(entry.transition_notes || '');
  const [checklist, setChecklist] = useState({
    arrangement_confirmed: !!entry.arrangement_confirmed,
    key_confirmed: !!entry.key_confirmed,
    transition_rehearsed: !!entry.transition_rehearsed,
    chart_verified: !!entry.chart_verified,
  });

  useEffect(() => {
    setPerformanceKey(entry.performance_key || keyDisplay || '');
    setSongNotes(entry.song_notes || '');
    setTransitionNotes(entry.transition_notes || '');
    setChecklist({
      arrangement_confirmed: !!entry.arrangement_confirmed,
      key_confirmed: !!entry.key_confirmed,
      transition_rehearsed: !!entry.transition_rehearsed,
      chart_verified: !!entry.chart_verified,
    });
  }, [entry.performance_key, entry.song_notes, entry.transition_notes, entry.arrangement_confirmed, entry.key_confirmed, entry.transition_rehearsed, entry.chart_verified, keyDisplay]);

  const savePreparation = async () => {
    await onSavePreparation(entry.entry_id, idx, {
      performance_key: performanceKey,
      song_notes: songNotes,
      transition_notes: transitionNotes,
      ...checklist,
    });
    setPreparing(false);
  };

  return (
    <div className="setlist-preparation-entry">
      <div
        className={`song-card setlist-song-item ${isDragging ? 'dragging' : ''}`}
        onClick={() => onClick(idx)}
        {...dragProps}
      >
        {isEditable && (
          <div
            className="setlist-drag-handle"
            onClick={(e) => e.stopPropagation()}
            {...handleProps}
            title="Drag to reorder"
          >
            &#9776;
          </div>
        )}
        <div className="setlist-song-pos">{idx + 1}</div>
        <div className="song-card-info">
          <div className="song-card-title">
            {entry.title}
            {entry.visibility === 'private' && (
              <span className="badge badge-private" title="Private">
                &#128274;
              </span>
            )}
            {!isLocal && isEditable && entry.content_override && (
              <span className="badge badge-edited">{t('setlist.edited')}</span>
            )}
          </div>
          <div className="song-card-meta">
            {sections.length > 0 && onSectionChange && (
              <select aria-label={`Section for ${entry.title}`} value={entry.section_id == null ? '' : String(entry.section_id)} onClick={(event) => event.stopPropagation()} onChange={(event) => onSectionChange(idx, event.target.value)}>
                <option value="">No section</option>
                {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
              </select>
            )}
            {entry.artist ? `${entry.artist} · ` : ''}
            {entry.performance_key ? `Performance key ${entry.performance_key}` : keyDisplay}
          </div>
          {(entry.song_notes || entry.transition_notes) && (
            <div className="setlist-preparation-summary">
              {entry.song_notes && <span>♪ {entry.song_notes}</span>}
              {entry.transition_notes && <span>→ {entry.transition_notes}</span>}
            </div>
          )}
        </div>
        {isEditable && (
          <div className="setlist-entry-controls" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-ghost btn-sm" onClick={() => onTranspose(entry.entry_id, idx, -1)}>
              &#9837;
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => onTranspose(entry.entry_id, idx, 1)}>
              &#9839;
            </button>
          </div>
        )}
        {isEditable && (
          <button
            className={`setlist-prepare-btn${preparing ? ' active' : ''}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPreparing((value) => !value);
            }}
            title="Prepare song"
          >
            PREP
          </button>
        )}
        {isEditable && (
          <button
            className="setlist-remove-btn"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(entry.entry_id, idx);
            }}
            title="Remove"
          >
            &#10005;
          </button>
        )}
      </div>
      {preparing && (
        <div className="setlist-preparation-panel">
          <div className="setlist-preparation-checklist" aria-label="Preparation checklist">
            {([['arrangement_confirmed', 'Arrangement confirmed'], ['key_confirmed', 'Key confirmed'], ['transition_rehearsed', 'Transition rehearsed'], ['chart_verified', 'Chart verified']] as const).map(([key, label]) => (
              <label key={key}><input type="checkbox" checked={checklist[key]} onChange={(event) => setChecklist((current) => ({ ...current, [key]: event.target.checked }))} /> {label}</label>
            ))}
          </div>
          <label>
            <span>Performance key</span>
            <input
              value={performanceKey}
              onChange={(e) => setPerformanceKey(e.target.value)}
              maxLength={20}
              placeholder={keyDisplay || 'e.g. Ab'}
            />
          </label>
          <label>
            <span>Song notes</span>
            <textarea
              value={songNotes}
              onChange={(e) => setSongNotes(e.target.value)}
              maxLength={2000}
              placeholder="Who starts, arrangement, dynamics, ending…"
            />
          </label>
          <label>
            <span>Transition after this song</span>
            <textarea
              value={transitionNotes}
              onChange={(e) => setTransitionNotes(e.target.value)}
              maxLength={2000}
              placeholder="Hold pad, leader speaks, count into next song…"
            />
          </label>
          <div className="setlist-preparation-actions">
            <button className="btn btn-sm" type="button" onClick={() => void savePreparation()}>
              Save preparation
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPreparing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
