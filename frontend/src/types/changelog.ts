export interface ChangelogEntry {
  id: number;
  version: string;
  title: string;
  summary: string;
  body: string;
  status: 'draft' | 'published';
  published_at: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_by_username?: string;
  updated_by_username?: string;
  created_at: string;
  updated_at: string;
}
