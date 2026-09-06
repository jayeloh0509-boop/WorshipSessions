export interface SetlistEntry {
  entry_id: number | string;
  song_id: number;
  title: string;
  artist: string;
  content: string;
  content_override: string | null;
  performance_key?: string | null;
  song_notes?: string;
  transition_notes?: string;
  arrangement_confirmed?: boolean;
  key_confirmed?: boolean;
  transition_rehearsed?: boolean;
  chart_verified?: boolean;
  transpose: number;
  nashville: number;
  font: number | null;
  two_col: number | null;
  bpm: number | null;
  youtube_url: string | null;
  language: string;
  is_private_placeholder?: boolean;
  is_missing?: boolean;
  load_error?: string;
  visibility?: string;
  // Per-song overrides (runtime only)
  _num?: number | null;
  _twoCol?: boolean | null;
  section_id?: number | string | null;
  section_name?: string | null;
  _font?: number | null;
  _hideYt?: boolean | null;
}

export interface SetlistSection {
  id: number | string;
  setlist_id?: number | string;
  name: string;
  position: number;
}

export interface Setlist {
  id: number | string;
  name: string;
  visibility: string;
  event_date: string | null;
  rehearsal_notes?: string;
  user_id?: number;
  song_count?: number;
  username?: string;
  entries: SetlistEntry[];
  sections?: SetlistSection[];
  created_at?: string;
  updated_at?: string;
  isLocal?: boolean;
  isStale?: boolean;
}

export interface SetlistListItem {
  id: number | string;
  name: string;
  visibility: string;
  event_date: string | null;
  song_count: number;
  username?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LocalSetlistEntry {
  song_id: number;
  title: string;
  artist: string;
  transpose: number;
  nashville: number;
  performance_key?: string | null;
  song_notes?: string;
  transition_notes?: string;
  arrangement_confirmed?: boolean;
  key_confirmed?: boolean;
  transition_rehearsed?: boolean;
  chart_verified?: boolean;
  section_id?: number | string | null;
  section_name?: string | null;
}

export interface LocalSetlistSection {
  id: string;
  name: string;
  position: number;
}

export interface LocalSetlist {
  id: string;
  name: string;
  entries: LocalSetlistEntry[];
  sections?: LocalSetlistSection[];
  rehearsal_notes?: string;
}

export interface SetlistPreferences {
  nashville: boolean;
  twoCol: boolean;
  fontSize: number;
  hideYt: boolean;
}
