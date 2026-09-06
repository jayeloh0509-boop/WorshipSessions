import type { User, LocalSetlist } from '../types';
import { clampFontSize } from './chords';

export type SongReadingPreferences = {
  transpose?: number;
  nashville?: boolean;
  fontSize?: number;
  twoCol?: boolean;
  chartTone?: 'paper' | 'dark';
  autoFit?: boolean;
  simplified?: boolean;
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
  try {
    localStorage.setItem(KEYS.user, JSON.stringify(user));
  } catch {
    // Authentication persistence is best-effort when storage is blocked.
  }
}

export function removeStoredUser(): void {
  try {
    localStorage.removeItem(KEYS.user);
  } catch {
    // Storage may be unavailable in private browsing or embedded contexts.
  }
}

export function getStoredTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem(KEYS.theme) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function setStoredTheme(theme: 'dark' | 'light'): void {
  try {
    localStorage.setItem(KEYS.theme, theme);
  } catch {
    // Theme persistence is best-effort.
  }
}

export function getStoredChartTone(): 'paper' | 'dark' {
  try {
    return localStorage.getItem(KEYS.chartTone) === 'dark' ? 'dark' : 'paper';
  } catch {
    return 'paper';
  }
}

export function setStoredChartTone(tone: 'paper' | 'dark'): void {
  try {
    localStorage.setItem(KEYS.chartTone, tone);
  } catch {
    // Chart tone persistence is best-effort.
  }
}

export function getStoredFontSize(): number {
  try {
    return parseInt(localStorage.getItem(KEYS.fontsize) || '0') || 0;
  } catch {
    return 0;
  }
}

export function setStoredFontSize(size: number): void {
  try {
    localStorage.setItem(KEYS.fontsize, String(size));
  } catch {
    // Font-size persistence is best-effort.
  }
}

export function getLocalSetlists(): LocalSetlist[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS.localSetlists) || '[]');
  } catch {
    return [];
  }
}

export function saveLocalSetlists(arr: LocalSetlist[]): void {
  try {
    localStorage.setItem(KEYS.localSetlists, JSON.stringify(arr));
  } catch {
    // Local setlists remain usable in memory when storage is blocked/full.
  }
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
  if (typeof raw.simplified === 'boolean') result.simplified = raw.simplified;
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

export function getCachedSetlist<T>(setlistId: number | string): T | null {
  try {
    const raw = sessionStorage.getItem(`cv_setlist_cache:${String(setlistId)}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function cacheSetlist<T>(setlistId: number | string, value: T): void {
  try {
    sessionStorage.setItem(`cv_setlist_cache:${String(setlistId)}`, JSON.stringify(value));
  } catch {
    // Offline cache is best-effort and must never block playback.
  }
}
