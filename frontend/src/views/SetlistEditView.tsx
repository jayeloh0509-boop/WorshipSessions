import { Fragment, useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { useLocalSetlists } from '../hooks/useLocalSetlists';
import { formatLocalEntry, enrichLocalSetlistSongs } from '../lib/setlists';
import { SongPicker } from '../components/SongPicker';
import { Loading } from '../components/Loading';
import { EmptyState } from '../components/EmptyState';
import { SetlistEntryCard } from '../components/SetlistEntryCard';
import type { Setlist, SongListItem } from '../types';
import { useDragReorder } from '../hooks/useDragReorder';
import { getSongKey } from '../lib/chords';
import { getTransposeDelta } from '../lib/keys';

interface SetlistEditViewProps {
  setlistId: number | string;
  navigate: (view: string, params?: Record<string, string>) => void;
}

export function SetlistEditView({ setlistId, navigate }: SetlistEditViewProps) {
  const apiCall = useApi();
  const { user } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const {
    assignSection,
    createSection,
    updateSection,
    removeSection,
    reorderSections,
    getOne,
    rename,
    remove,
    removeEntry: lsRemoveEntry,
    addEntry: lsAddEntry,
    updateEntry: lsUpdateEntry,
    updateRehearsalNotes: lsUpdateRehearsalNotes,
    reorderEntries: lsReorderEntries,
  } = useLocalSetlists();

  const isLocal = typeof setlistId === 'string' && setlistId.startsWith('local_');
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [rehearsalNotes, setRehearsalNotes] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');

  const load = useCallback(async () => {
    if (isLocal) {
      const sl = getOne(String(setlistId));
      if (!sl) {
        navigate(user ? 'setlists' : 'public-setlists');
        return;
      }

      const formatted: Setlist = {
        id: sl.id,
        name: sl.name,
        sections: sl.sections || [],
        entries: sl.entries.map((e, idx) => formatLocalEntry(e, idx)),
        isLocal: true,
        visibility: 'private',
        event_date: null,
        rehearsal_notes: sl.rehearsal_notes || '',
      };
      setSetlist(formatted);
      setRehearsalNotes(sl.rehearsal_notes || '');
      location.hash = `#setlist/${setlistId}`;
      return;
    }

    try {
      let sl: Setlist;
      if (user) {
        try {
          sl = await apiCall<Setlist>('GET', `/api/setlists/${setlistId}`);
        } catch (err) {
          if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
            sl = await apiCall<Setlist>('GET', `/api/setlists/public/${setlistId}`);
          } else {
            throw err;
          }
        }
      } else {
        sl = await apiCall<Setlist>('GET', `/api/setlists/public/${setlistId}`);
      }
      setSetlist(sl);
      setRehearsalNotes(sl.rehearsal_notes || '');
      location.hash = `#setlist/${setlistId}`;
    } catch (e) {
      toast((e as Error).message, 'error');
      navigate(user ? 'setlists' : 'public-setlists');
    }
  }, [apiCall, toast, navigate, setlistId, user, isLocal, getOne]);

  useEffect(() => {
    load();
  }, [load]);

  const {
    items: reorderedEntries,
    dragProps,
    handleProps,
    draggedIdx,
  } = useDragReorder(setlist?.entries || [], async (newEntries) => {
    if (!setlist) return;

    // Update React state first
    setSetlist((prev) => (prev ? { ...prev, entries: newEntries } : null));

    if (isLocal) {
      const localEntries = newEntries.map((e) => ({
        song_id: e.song_id,
        title: e.title,
        artist: e.artist,
        transpose: e.transpose,
        nashville: e.nashville,
        performance_key: e.performance_key,
        song_notes: e.song_notes,
        transition_notes: e.transition_notes,
        arrangement_confirmed: e.arrangement_confirmed,
        key_confirmed: e.key_confirmed,
        transition_rehearsed: e.transition_rehearsed,
        chart_verified: e.chart_verified,
        section_id: e.section_id,
        section_name: e.section_name,
      }));
      lsReorderEntries(String(setlistId), localEntries);
    } else {
      try {
        await apiCall('PUT', `/api/setlists/${setlistId}/reorder`, {
          entry_ids: newEntries.map((e) => e.entry_id),
        });
      } catch (e) {
        toast((e as Error).message, 'error');
        load();
      }
    }
  });

  const saveMeta = async () => {
    if (!setlist) return;
    const nameInput = (document.getElementById('setlist-name-input') as HTMLInputElement)?.value.trim();
    if (!nameInput) return;

    if (isLocal) {
      if (nameInput.length > 200) return;
      rename(String(setlistId), nameInput);
      lsUpdateRehearsalNotes(String(setlistId), rehearsalNotes);
      setSetlist((prev) => (prev ? { ...prev, name: nameInput, rehearsal_notes: rehearsalNotes } : prev));
    } else {
      const vis = (document.getElementById('setlist-visibility') as HTMLInputElement)?.checked ? 'public' : 'private';
      const date = (document.getElementById('setlist-date') as HTMLInputElement)?.value || '';
      try {
        await apiCall('PUT', `/api/setlists/${setlistId}`, {
          name: nameInput,
          visibility: vis,
          event_date: date,
          rehearsal_notes: rehearsalNotes,
        });
        setSetlist((prev) =>
          prev ? { ...prev, name: nameInput, visibility: vis, event_date: date, rehearsal_notes: rehearsalNotes } : prev,
        );
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }
  };

  const deleteSetlist = async () => {
    if (!confirm(t('setlist.confirmDelete'))) return;

    if (isLocal) {
      remove(String(setlistId));
      toast(t('setlist.deleted'), 'success');
      location.hash = '';
      navigate(user ? 'setlists' : 'public-setlists');
    } else {
      try {
        await apiCall('DELETE', `/api/setlists/${setlistId}`);
        toast(t('setlist.deleted'), 'success');
        location.hash = '';
        navigate('setlists');
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }
  };

  // Reordering is handled by useDragReorder hook

  const removeEntry = async (entryId: number | string, idx: number) => {
    if (isLocal) {
      lsRemoveEntry(String(setlistId), idx);
      setSetlist((prev) => (prev ? { ...prev, entries: prev.entries.filter((_, i) => i !== idx) } : prev));
      toast(t('setlist.songRemoved'), 'success');
    } else {
      try {
        await apiCall('DELETE', `/api/setlists/${setlistId}/entries/${entryId}`);
        setSetlist((prev) => (prev ? { ...prev, entries: prev.entries.filter((e) => e.entry_id !== entryId) } : prev));
        toast(t('setlist.songRemoved'), 'success');
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }
  };

  const addSong = async (song: SongListItem) => {
    if (isLocal) {
      const added = lsAddEntry(String(setlistId), {
        song_id: song.id,
        title: song.title,
        artist: song.artist || '',
        transpose: 0,
        nashville: 0,
      });
      if (added) {
        toast(t('setlist.songAdded'), 'success');
        setPickerOpen(false);
        load();
      } else {
        toast('Failed to add song', 'error');
      }
    } else {
      try {
        await apiCall('POST', `/api/setlists/${setlistId}/songs`, { song_id: song.id });
        toast(t('setlist.songAdded'), 'success');
        setPickerOpen(false);
        load();
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }
  };

  const handleTransposeEntry = async (entryId: number | string, idx: number, delta: number) => {
    if (!setlist) return;
    const entry = reorderedEntries[idx];
    const newTranspose = (entry.transpose ?? 0) + delta;
    const performanceKey = entry.performance_key
      ? getSongKey(entry.content_override || entry.content, newTranspose)
      : entry.performance_key;

    if (isLocal) {
      lsUpdateEntry(String(setlistId), idx, { transpose: newTranspose, performance_key: performanceKey });
      setSetlist((prev) => {
        if (!prev) return null;
        const entries = [...prev.entries];
        entries[idx] = { ...entries[idx], transpose: newTranspose, performance_key: performanceKey };
        return { ...prev, entries };
      });
    } else {
      try {
        await apiCall('PUT', `/api/setlists/${setlistId}/entries/${entryId}`, {
          transpose: newTranspose,
          performance_key: performanceKey,
        });
        setSetlist((prev) => {
          if (!prev) return null;
          const entries = [...prev.entries];
          entries[idx] = { ...entries[idx], transpose: newTranspose, performance_key: performanceKey };
          return { ...prev, entries };
        });
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }
  };

  const savePreparation = async (
    entryId: number | string,
    idx: number,
    values: { performance_key: string; song_notes: string; transition_notes: string; arrangement_confirmed: boolean; key_confirmed: boolean; transition_rehearsed: boolean; chart_verified: boolean },
  ) => {
    if (!setlist) return;
    const entry = reorderedEntries[idx];
    const currentKey = getSongKey(entry.content_override || entry.content, entry.transpose);
    const requestedKey = values.performance_key.trim();
    let transpose =
      requestedKey && currentKey ? entry.transpose + getTransposeDelta(currentKey, requestedKey) : entry.transpose;
    while (transpose > 12) transpose -= 12;
    while (transpose < -12) transpose += 12;
    const updates = {
      performance_key: requestedKey || null,
      song_notes: values.song_notes.trim(),
      transition_notes: values.transition_notes.trim(),
      arrangement_confirmed: values.arrangement_confirmed,
      key_confirmed: values.key_confirmed,
      transition_rehearsed: values.transition_rehearsed,
      chart_verified: values.chart_verified,
      transpose,
    };

    if (isLocal) {
      lsUpdateEntry(String(setlistId), idx, updates);
    } else {
      await apiCall('PUT', `/api/setlists/${setlistId}/entries/${entryId}`, updates);
    }

    setSetlist((prev) => {
      if (!prev) return null;
      const entries = [...prev.entries];
      entries[idx] = { ...entries[idx], ...updates };
      return { ...prev, entries };
    });
    toast('Preparation saved', 'success');
  };

  const playLocal = async (startIndex = 0) => {
    const sl = getOne(String(setlistId));
    if (!sl || sl.entries.length === 0) return;
    try {
      const entries = await enrichLocalSetlistSongs(sl.entries, apiCall);
      if (entries.length === 0) {
        toast('No songs could be loaded', 'error');
        return;
      }
      const enrichedSetlist: Setlist = {
        id: String(setlistId),
        name: sl.name,
        sections: sl.sections || [],
        entries,
        isLocal: true,
        visibility: 'private',
        event_date: null,
        rehearsal_notes: sl.rehearsal_notes || '',
      };
      navigate('setlist-play', {
        id: String(setlistId),
        local: '1',
        index: String(startIndex),
        _setlist: JSON.stringify(enrichedSetlist),
      });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const handleItemClick = (idx: number) => {
    if (isLocal) {
      playLocal(idx);
    } else {
      navigate('setlist-play', { id: String(setlistId), index: String(idx) });
    }
  };

  const saveSection = async () => {
    const name = newSectionName.trim();
    if (!setlist || !name) return;
    try {
      if (isLocal) {
        const section = createSection(String(setlistId), name);
        if (section) setSetlist((prev) => (prev ? { ...prev, sections: [...(prev.sections || []), section] } : prev));
      } else {
        const section = await apiCall<{ id: number; name: string; position: number }>('POST', `/api/setlists/${setlistId}/sections`, { name });
        setSetlist((prev) => (prev ? { ...prev, sections: [...(prev.sections || []), { ...section, setlist_id: setlistId }] } : prev));
      }
      setNewSectionName('');
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const renameSection = async (sectionId: number | string, currentName: string) => {
    const name = window.prompt('Section name', currentName)?.trim();
    if (!name || name === currentName || !setlist) return;
    try {
      if (isLocal) updateSection(String(setlistId), String(sectionId), name);
      else await apiCall('PUT', `/api/setlists/${setlistId}/sections/${sectionId}`, { name });
      setSetlist((prev) => prev ? { ...prev, sections: (prev.sections || []).map((s) => s.id === sectionId ? { ...s, name } : s), entries: prev.entries.map((e) => e.section_id === sectionId ? { ...e, section_name: name } : e) } : prev);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const deleteSection = async (sectionId: number | string) => {
    if (!setlist || !window.confirm('Remove this section? Songs will remain in the setlist.')) return;
    try {
      if (isLocal) removeSection(String(setlistId), String(sectionId));
      else await apiCall('DELETE', `/api/setlists/${setlistId}/sections/${sectionId}`);
      setSetlist((prev) => prev ? { ...prev, sections: (prev.sections || []).filter((s) => s.id !== sectionId), entries: prev.entries.map((e) => e.section_id === sectionId ? { ...e, section_id: null, section_name: null } : e) } : prev);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const moveSection = async (sectionId: number | string, direction: -1 | 1) => {
    if (!setlist) return;
    const sections = [...(setlist.sections || [])];
    const index = sections.findIndex((section) => section.id === sectionId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= sections.length) return;
    [sections[index], sections[nextIndex]] = [sections[nextIndex], sections[index]];
    try {
      if (isLocal) reorderSections(String(setlistId), sections.map((section) => String(section.id)));
      else await apiCall('PUT', `/api/setlists/${setlistId}/sections/reorder`, { section_ids: sections.map((section) => section.id) });
      setSetlist((prev) => prev ? { ...prev, sections: sections.map((section, position) => ({ ...section, position: position + 1 })) } : prev);
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const changeEntrySection = async (idx: number, sectionId: string) => {
    if (!setlist) return;
    const section = (setlist.sections || []).find((s) => String(s.id) === sectionId) || null;
    try {
      if (isLocal) assignSection(String(setlistId), idx, section && { id: String(section.id), name: section.name, position: section.position });
      else await apiCall('PUT', `/api/setlists/${setlistId}/entries/${setlist.entries[idx].entry_id}/section`, { section_id: section?.id ?? null });
      setSetlist((prev) => { if (!prev) return null; const entries = [...prev.entries]; entries[idx] = { ...entries[idx], section_id: section?.id ?? null, section_name: section?.name ?? null }; return { ...prev, entries }; });
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const copyShareLink = () => {
    const url = window.location.origin + window.location.pathname + `#setlist/${setlistId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast(t('setlist.linkCopied') || 'Link copied to clipboard', 'success'))
      .catch(() => toast('Failed to copy link', 'error'));
  };

  const isEditable = isLocal || (setlist?.user_id != null && user != null && setlist.user_id === user.id);

  if (!setlist) return <Loading />;

  return (
    <>
      <div className="song-view-header">
        <div className="song-view-nav">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(isEditable ? 'setlists' : 'public-setlists')}
          >
            &#8592; {t('songView.back')}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {setlist.entries.length > 0 && (
              <button className="btn btn-sm" onClick={() => handleItemClick(0)}>
                {t('setlist.play')}
              </button>
            )}
            {!isLocal && setlist.visibility === 'public' && (
              <button className="btn btn-ghost btn-sm" onClick={copyShareLink}>
                {t('setlist.share')}
              </button>
            )}
            {isEditable && (
              <button className="btn btn-danger btn-sm" onClick={deleteSetlist}>
                {t('admin.delete')}
              </button>
            )}
          </div>
        </div>
        <div className="setlist-name-row">
          {!isEditable ? (
            <div className="setlist-name-input" style={{ border: 'none', background: 'none', padding: 0 }}>
              {setlist.name}
            </div>
          ) : (
            <input
              type="text"
              id="setlist-name-input"
              className="setlist-name-input"
              defaultValue={setlist.name}
              onBlur={saveMeta}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
          )}
        </div>
        <div className="setlist-meta-row">
          {isLocal ? (
            <>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Local Setlist (Saved in Browser)</span>
              {isEditable && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', marginTop: 12 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Rehearsal notes
                  </span>
                  <textarea
                    value={rehearsalNotes}
                    maxLength={2000}
                    rows={3}
                    placeholder="Overall arrangement, service cues, or team reminders"
                    onChange={(event) => setRehearsalNotes(event.target.value)}
                    onBlur={() => void saveMeta()}
                  />
                </label>
              )}
            </>
          ) : !isEditable ? (
            <>
              {setlist.username && <span style={{ fontSize: 13, color: 'var(--muted)' }}>By @{setlist.username}</span>}
              {setlist.event_date && (
                <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 8 }}>Date: {setlist.event_date}</span>
              )}
            </>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <span className="toggle">
                  <input
                    type="checkbox"
                    id="setlist-visibility"
                    defaultChecked={setlist.visibility === 'public'}
                    onChange={saveMeta}
                  />
                  <span className="toggle-slider" />
                </span>
                {t('setlist.visibility')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span
                  style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 12 }}
                >
                  {t('setlist.date')}
                </span>
                <input type="date" id="setlist-date" defaultValue={setlist.event_date || ''} onChange={saveMeta} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', marginTop: 12 }}>
                <span style={{ color: 'var(--muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Rehearsal notes
                </span>
                <textarea
                  value={rehearsalNotes}
                  maxLength={2000}
                  rows={3}
                  placeholder="Overall arrangement, service cues, or team reminders"
                  onChange={(event) => setRehearsalNotes(event.target.value)}
                  onBlur={() => void saveMeta()}
                />
              </label>
            </>
          )}
        </div>
      </div>

      {isEditable && (setlist.sections?.length || 0) > 0 && (
        <div className="setlist-sections" aria-label="Service flow sections">
          {(setlist.sections || []).map((section) => (
            <div key={section.id} className="setlist-section-row">
              <strong>{section.name}</strong>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void moveSection(section.id, -1)} disabled={section.position === 1} aria-label={`Move ${section.name} up`}>↑</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void moveSection(section.id, 1)} disabled={section.position === (setlist.sections || []).length} aria-label={`Move ${section.name} down`}>↓</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void renameSection(section.id, section.name)}>Rename</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void deleteSection(section.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}
      {isEditable && (
        <div className="setlist-section-create" style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
          <input value={newSectionName} maxLength={80} placeholder="Add service section (e.g. WORSHIP)" aria-label="New service section" onChange={(event) => setNewSectionName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveSection(); }} />
          <button className="btn btn-sm" type="button" onClick={() => void saveSection()}>Add section</button>
        </div>
      )}

      {setlist.entries.length === 0 ? (
        <EmptyState icon="&#127926;" text={t('setlist.noSongsYet')} />
      ) : (
        <div className="setlist-entries" id="setlist-entries">
          {reorderedEntries.map((entry, idx) => (
            <Fragment key={entry.entry_id}>
              {entry.section_name && (idx === 0 || reorderedEntries[idx - 1]?.section_id !== entry.section_id) && (
                <div className="setlist-section-heading" role="heading" aria-level={3}>{entry.section_name}</div>
              )}
              <SetlistEntryCard
              key={entry.entry_id}
              entry={entry}
              idx={idx}
              isEditable={isEditable}
              isLocal={isLocal}
              onRemove={removeEntry}
              onTranspose={handleTransposeEntry}
              onClick={handleItemClick}
              onSavePreparation={savePreparation}
              sections={setlist.sections}
              onSectionChange={changeEntrySection}
              dragProps={dragProps(idx)}
              handleProps={handleProps(idx)}
              isDragging={draggedIdx === idx}
              t={t}
            />
            </Fragment>
          ))}
        </div>
      )}

      {isEditable && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button className="btn" onClick={() => setPickerOpen(true)}>
            {t('setlist.addSongs')}
          </button>
        </div>
      )}

      {pickerOpen && <SongPicker onPick={addSong} onClose={() => setPickerOpen(false)} />}
    </>
  );
}
