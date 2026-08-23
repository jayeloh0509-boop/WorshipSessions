import type { User, LocalSetlist } from '../types';
import { clampFontSize } from './chords';

export type SongReadingPreferences = {
  transpose?: number;
  nashville?: boolean;
  fontSize?: number;
  twoCol?: boolean;
  chartTone?: 'paper' | 'dark';
  autoFit?: boolean;
};

const KEYS = {
  user: 'cv_user',
  theme: 'cv_theme',
  chartTone: 'cv_chart_tone',
  fontsize: 'cv_fontsize',
  localSetlists: 'cv_local_setlists',
  setlistOverrides: 'cv_setlist_overrides',
  songReadingPreferences: 'cv_song_reading_preferences_v1',
} as const;

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(KEYS.user);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User): void {
  localStorage.setItem(KEYS.user, JSON.stringify(user));
}

export function removeStoredUser(): void {
  localStorage.removeItem(KEYS.user);
}

export function getStoredTheme(): 'dark' | 'light' {
  return localStorage.getItem(KEYS.theme) === 'light' ? 'light' : 'dark';
}

export function setStoredTheme(theme: 'dark' | 'light'): void {
  localStorage.setItem(KEYS.theme, theme);
}

export function getStoredChartTone(): 'paper' | 'dark' {
  return localStorage.getItem(KEYS.chartTone) === 'dark' ? 'dark' : 'paper';
}

export function setStoredChartTone(tone: 'paper' | 'dark'): void {
  localStorage.setItem(KEYS.chartTone, tone);
}

export function getStoredFontSize(): number {
  return parseInt(localStorage.getItem(KEYS.fontsize) || '0') || 0;
}

export function setStoredFontSize(size: number): void {
  localStorage.setItem(KEYS.fontsize, String(size));
}

export function getLocalSetlists(): LocalSetlist[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS.localSetlists) || '[]');
  } catch {
    return [];
  }
}

export function saveLocalSetlists(arr: LocalSetlist[]): void {
  localStorage.setItem(KEYS.localSetlists, JSON.stringify(arr));
}

export function sanitizeSongReadingPreferences(value: unknown): SongReadingPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const result: SongReadingPreferences = {};
  if (typeof raw.transpose === 'number' && Number.isFinite(raw.transpose)) {
    result.transpose = Math.max(-11, Math.min(11, Math.trunc(raw.transpose)));
  }
  if (typeof raw.nashville === 'boolean') result.nashville = raw.nashville;
  if (typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize)) {
    result.fontSize = clampFontSize(raw.fontSize);
  }
  if (typeof raw.twoCol === 'boolean') result.twoCol = raw.twoCol;
  if (raw.chartTone === 'paper' || raw.chartTone === 'dark') result.chartTone = raw.chartTone;
  if (typeof raw.autoFit === 'boolean') result.autoFit = raw.autoFit;
  if (result.nashville) result.transpose = 0;
  return result;
}

function getSongReadingPreferenceMap(): Record<string, SongReadingPreferences> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEYS.songReadingPreferences) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getSongReadingPreferences(songId: number | string): SongReadingPreferences {
  return sanitizeSongReadingPreferences(getSongReadingPreferenceMap()[String(songId)]);
}

export function saveSongReadingPreferences(
  songId: number | string,
  patch: Partial<SongReadingPreferences>,
): SongReadingPreferences {
  const all = getSongReadingPreferenceMap();
  const id = String(songId);
  const next = sanitizeSongReadingPreferences({ ...getSongReadingPreferences(id), ...patch });
  all[id] = next;
  try {
    localStorage.setItem(KEYS.songReadingPreferences, JSON.stringify(all));
  } catch {
    // Preferences are best-effort. Private browsing, storage quotas, or
    // browser policy can make localStorage writes fail.
  }
  return next;
}

export function clearSongReadingPreferences(songId: number | string): void {
  const all = getSongReadingPreferenceMap();
  delete all[String(songId)];
  try {
    localStorage.setItem(KEYS.songReadingPreferences, JSON.stringify(all));
  } catch {
    // Best-effort local preference cleanup.
  }
}

/**
 * Gets personal transpose/Nashville overrides for a specific setlist.
 * Format: { [entryId]: { transpose: number, nashville: boolean, font: number, two_col: boolean } }
 */
export function getSetlistOverrides(
  setlistId: number | string,
): Record<string, { transpose?: number; nashville?: boolean; font?: number; two_col?: number | null }> {
  try {
    const all = JSON.parse(localStorage.getItem(KEYS.setlistOverrides) || '{}');
    return all[String(setlistId)] || {};
  } catch {
    return {};
  }
}

/**
 * Saves a personal transpose/Nashville override for a single setlist entry.
 */
export function saveSetlistOverride(
  setlistId: number | string,
  entryId: number | string,
  data: { transpose?: number; nashville?: boolean; font?: number | null; two_col?: number | null },
): void {
  try {
    const all = JSON.parse(localStorage.getItem(KEYS.setlistOverrides) || '{}');
    const sid = String(setlistId);
    const eid = String(entryId);
    if (!all[sid]) all[sid] = {};
    all[sid][eid] = { ...all[sid][eid], ...data };
    localStorage.setItem(KEYS.setlistOverrides, JSON.stringify(all));
  } catch (e) {
    console.error('Failed to save setlist override', e);
  }
}

export function getSessionItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setSessionItem(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}

export function removeSessionItem(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {}
}
