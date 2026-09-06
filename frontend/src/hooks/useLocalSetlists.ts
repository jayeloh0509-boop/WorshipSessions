import { useState, useCallback } from 'react';
import type { LocalSetlist, LocalSetlistEntry, LocalSetlistSection } from '../types';
import { getLocalSetlists, saveLocalSetlists } from '../lib/storage';
import { MAX_LOCAL_SETLISTS, MAX_LOCAL_ENTRIES } from '../lib/constants';

export function useLocalSetlists() {
  const [setlists, setSetlists] = useState<LocalSetlist[]>(() => getLocalSetlists());

  const refresh = useCallback(() => {
    setSetlists(getLocalSetlists());
  }, []);

  const create = useCallback((name: string): LocalSetlist | null => {
    const all = getLocalSetlists();
    if (all.length >= MAX_LOCAL_SETLISTS) return null;
    const sl: LocalSetlist = { id: 'local_' + Date.now(), name, entries: [], rehearsal_notes: '' };
    all.push(sl);
    saveLocalSetlists(all);
    setSetlists(all);
    return sl;
  }, []);

  const duplicate = useCallback((id: string, name?: string): LocalSetlist | null => {
    const all = getLocalSetlists();
    if (all.length >= MAX_LOCAL_SETLISTS) return null;
    const source = all.find((s) => s.id === id);
    if (!source) return null;
    const copy: LocalSetlist = {
      ...source,
      id: 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: name?.trim() || `${source.name} Copy`,
      sections: (source.sections || []).map((section) => ({ ...section })),
      entries: source.entries.map((entry) => ({ ...entry })),
      rehearsal_notes: source.rehearsal_notes || '',
    };
    all.push(copy);
    saveLocalSetlists(all);
    setSetlists([...all]);
    return copy;
  }, []);

  const updateRehearsalNotes = useCallback((id: string, notes: string) => {
    const all = getLocalSetlists();
    const sl = all.find((s) => s.id === id);
    if (!sl) return;
    sl.rehearsal_notes = notes.slice(0, 2000);
    saveLocalSetlists(all);
    setSetlists([...all]);
  }, []);

  const createSection = useCallback((id: string, name: string): LocalSetlistSection | null => {
    const all = getLocalSetlists();
    const sl = all.find((s) => s.id === id);
    if (!sl || !name.trim()) return null;
    const sections = sl.sections || [];
    const section = { id: `${id}_section_${Date.now()}`, name: name.trim(), position: sections.length + 1 };
    sl.sections = [...sections, section];
    saveLocalSetlists(all);
    setSetlists([...all]);
    return section;
  }, []);

  const updateSection = useCallback((id: string, sectionId: string, name: string) => {
    const all = getLocalSetlists();
    const sl = all.find((s) => s.id === id);
    const section = sl?.sections?.find((candidate) => candidate.id === sectionId);
    if (!section || !name.trim()) return;
    section.name = name.trim();
    saveLocalSetlists(all);
    setSetlists([...all]);
  }, []);

  const removeSection = useCallback((id: string, sectionId: string) => {
    const all = getLocalSetlists();
    const sl = all.find((s) => s.id === id);
    if (!sl) return;
    sl.sections = (sl.sections || []).filter((section) => section.id !== sectionId).map((section, position) => ({ ...section, position: position + 1 }));
    sl.entries.forEach((entry) => { if (entry.section_id === sectionId) { entry.section_id = null; entry.section_name = null; } });
    saveLocalSetlists(all);
    setSetlists([...all]);
  }, []);

  const reorderSections = useCallback((id: string, sectionIds: string[]) => {
    const all = getLocalSetlists();
    const sl = all.find((candidate) => candidate.id === id);
    if (!sl) return;
    const sections = sl.sections || [];
    const ordered = sectionIds.map((sectionId) => sections.find((section) => section.id === sectionId)).filter((section): section is LocalSetlistSection => Boolean(section));
    if (ordered.length !== sections.length) return;
    sl.sections = ordered.map((section, position) => ({ ...section, position: position + 1 }));
    saveLocalSetlists(all);
    setSetlists([...all]);
  }, []);
  const assignSection = useCallback((id: string, idx: number, section: LocalSetlistSection | null) => {
    const all = getLocalSetlists();
    const sl = all.find((candidate) => candidate.id === id);
    if (!sl?.entries[idx]) return;
    sl.entries[idx].section_id = section?.id || null;
    sl.entries[idx].section_name = section?.name || null;
    saveLocalSetlists(all);
    setSetlists([...all]);
  }, []);

  const remove = useCallback((id: string) => {
    const all = getLocalSetlists().filter((s) => s.id !== id);
    saveLocalSetlists(all);
    setSetlists(all);
  }, []);

  const rename = useCallback((id: string, name: string) => {
    const all = getLocalSetlists();
    const sl = all.find((s) => s.id === id);
    if (sl) {
      sl.name = name;
      saveLocalSetlists(all);
      setSetlists([...all]);
    }
  }, []);

  const getOne = useCallback((id: string): LocalSetlist | undefined => {
    return getLocalSetlists().find((s) => s.id === id);
  }, []);

  const addEntry = useCallback((id: string, entry: LocalSetlistEntry): boolean => {
    const all = getLocalSetlists();
    const sl = all.find((s) => s.id === id);
    if (!sl || sl.entries.length >= MAX_LOCAL_ENTRIES) return false;
    sl.entries.push(entry);
    saveLocalSetlists(all);
    setSetlists([...all]);
    return true;
  }, []);

  const removeEntry = useCallback((id: string, idx: number) => {
    const all = getLocalSetlists();
    const sl = all.find((s) => s.id === id);
    if (sl) {
      sl.entries.splice(idx, 1);
      saveLocalSetlists(all);
      setSetlists([...all]);
    }
  }, []);

  const moveEntry = useCallback((id: string, idx: number, dir: number) => {
    const all = getLocalSetlists();
    const sl = all.find((s) => s.id === id);
    if (!sl) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sl.entries.length) return;
    const tmp = sl.entries[idx];
    sl.entries[idx] = sl.entries[newIdx];
    sl.entries[newIdx] = tmp;
    saveLocalSetlists(all);
    setSetlists([...all]);
  }, []);

  const updateEntry = useCallback((id: string, idx: number, updates: Partial<LocalSetlistEntry>) => {
    const all = getLocalSetlists();
    const sl = all.find((s) => s.id === id);
    if (sl && sl.entries[idx]) {
      Object.assign(sl.entries[idx], updates);
      saveLocalSetlists(all);
      setSetlists([...all]);
    }
  }, []);

  const reorderEntries = useCallback((id: string, newEntries: LocalSetlistEntry[]) => {
    const all = getLocalSetlists();
    const sl = all.find((s) => s.id === id);
    if (sl) {
      sl.entries = newEntries;
      saveLocalSetlists(all);
      setSetlists([...all]);
    }
  }, []);

  return {
    setlists,
    refresh,
    create,
    duplicate,
    createSection,
    updateSection,
    removeSection,
    reorderSections,
    assignSection,
    updateRehearsalNotes,
    remove,
    rename,
    getOne,
    addEntry,
    removeEntry,
    moveEntry,
    updateEntry,
    reorderEntries,
  };
}
