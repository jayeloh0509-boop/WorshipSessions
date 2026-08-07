import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import type { Song, SongListItem } from '../types';

interface SongSearchModalProps {
  onImport: (content: string) => void;
  onClose: () => void;
}

interface LocalResponse { songs: SongListItem[]; }
interface PublicCatalogSong {
  slug: string;
  title: string;
  artist: string;
  key: string;
  source: string;
  license: string;
}
interface SearchResult {
  id: string;
  kind: 'local' | 'public';
  title: string;
  artist: string;
  key: string;
  source: string;
  license?: string;
  localSong?: SongListItem;
  slug?: string;
  popular?: boolean;
}

function asPublicResult(song: PublicCatalogSong, popular = false): SearchResult {
  return {
    id: `public:${song.slug}`,
    kind: 'public',
    title: song.title,
    artist: song.artist,
    key: song.key,
    source: song.source,
    license: song.license,
    slug: song.slug,
    popular,
  };
}

export function SongSearchModal({ onImport, onClose }: SongSearchModalProps) {
  const apiCall = useApi();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [popular, setPopular] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [popularLoading, setPopularLoading] = useState(true);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setLoading(true);
    setSearched(true);
    try {
      const encoded = encodeURIComponent(q);
      const [mine, shared, open] = await Promise.all([
        apiCall<LocalResponse>('GET', `/api/songs?q=${encoded}&limit=20`),
        apiCall<LocalResponse>('GET', `/api/songs/public?q=${encoded}&limit=20`),
        apiCall<{ songs: PublicCatalogSong[] }>('GET', `/api/songs/public-catalog/search?q=${encoded}`),
      ]);
      const local = new Map<number, SongListItem>();
      [...mine.songs, ...shared.songs].forEach((song) => local.set(song.id, song));
      setResults([
        ...open.songs.map((song) => asPublicResult(song)),
        ...[...local.values()].map((song): SearchResult => ({
          id: `local:${song.id}`,
          kind: 'local',
          title: song.title,
          artist: song.artist,
          key: song.key || '',
          source: `WorshipSessions · @${song.username}`,
          localSong: song,
        })),
      ]);
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const importSong = async (item: SearchResult) => {
    setImportingId(item.id);
    try {
      const path = item.kind === 'public'
        ? `/api/songs/public-catalog/${item.slug}`
        : `/api/songs/${item.localSong?.id}`;
      const song = await apiCall<Song>('GET', path);
      onImport(song.content);
      onClose();
      toast(`“${song.title}” loaded — review it, then save`, 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setImportingId(null);
    }
  };

  useEffect(() => {
    let active = true;
    apiCall<{ songs: PublicCatalogSong[] }>('GET', '/api/songs/public-catalog/popular')
      .then(({ songs }) => { if (active) setPopular(songs.map((song) => asPublicResult(song, true))); })
      .catch(() => { /* Search remains usable when recommendations are unavailable. */ })
      .finally(() => { if (active) setPopularLoading(false); });
    return () => { active = false; };
  }, [apiCall]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const displayed = searched ? results : popular;

  return createPortal(
    <div className="modal-backdrop song-search-backdrop" data-overlay onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="ocr-card song-search-modal" role="dialog" aria-modal="true" aria-label="Search song library">
        <div className="song-search-hero">
          <div className="song-search-hero-icon" aria-hidden="true">♫</div>
          <div className="song-search-heading">
            <div className="song-search-eyebrow">WorshipSessions Library</div>
            <h3 className="view-title">Find your next song</h3>
            <p>Search your library and reusable public-domain chord catalogs, then load an editable chart in one tap.</p>
          </div>
          <button className="song-search-close" onClick={onClose} aria-label="Close search">&#10005;</button>
        </div>

        <div className="song-search-box">
          <span className="song-search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            placeholder="Search by title, artist, or lyrics…"
            aria-label="Song title, artist, or lyrics"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') search(); }}
            autoFocus
          />
          {query && <button className="song-search-clear" aria-label="Clear search" onClick={() => { setQuery(''); setSearched(false); }}>×</button>}
          <button className="btn song-search-submit" onClick={search} disabled={loading || query.trim().length < 2}>
            {loading ? <><span className="mini-spinner" /> Searching</> : 'Search'}
          </button>
        </div>

        <div className="song-search-section-header">
          <div>
            <h4>{searched ? 'Search results' : 'Popular songs'}</h4>
            <p>{searched ? `${results.length} reusable ${results.length === 1 ? 'chart' : 'charts'} found` : 'Familiar public-domain favourites, ready to edit'}</p>
          </div>
          {!searched && <span className="popular-label">Popular</span>}
          {searched && <button className="song-search-back" onClick={() => { setSearched(false); setQuery(''); }}>View popular</button>}
        </div>

        <div className="song-search-results" aria-live="polite">
          {(loading || (!searched && popularLoading)) && [0, 1, 2].map((index) => (
            <div className="song-search-skeleton" key={index} aria-hidden="true">
              <span /><div><b /><i /></div><em />
            </div>
          ))}
          {!loading && searched && results.length === 0 && (
            <div className="song-search-empty">
              <span aria-hidden="true">♩</span>
              <strong>No reusable chart found</strong>
              <p>Try a shorter title or the artist’s name.</p>
            </div>
          )}
          {!popularLoading && !searched && popular.length === 0 && (
            <div className="song-search-empty"><strong>Popular songs are unavailable right now.</strong><p>You can still search above.</p></div>
          )}
          {!loading && displayed.map((song, index) => (
            <article className="song-search-result" key={song.id} style={{ '--result-index': index } as React.CSSProperties}>
              <div className="song-result-art" aria-hidden="true"><span>♫</span></div>
              <div className="song-card-info">
                <div className="song-result-title-row">
                  <h5>{song.title}</h5>
                  {song.popular && <span className="song-popular-dot" title="Popular song">●</span>}
                </div>
                <p>{song.artist || 'Traditional hymn'}</p>
                <div className="song-result-badges">
                  {song.key && <span className="song-key-badge">Key {song.key}</span>}
                  <span className="song-source-badge">{song.kind === 'public' ? 'Open catalog' : 'WorshipSessions'}</span>
                  {song.license && <span className="song-license-badge">✓ {song.license}</span>}
                </div>
              </div>
              <button className="song-use-button" onClick={() => importSong(song)} disabled={importingId !== null}>
                {importingId === song.id ? <><span className="mini-spinner" /> Loading</> : <>Use song <span aria-hidden="true">→</span></>}
              </button>
            </article>
          ))}
        </div>

        <div className="song-search-footer">
          <span aria-hidden="true">✦</span>
          <p>Charts are imported only from sources that permit reuse and converted to editable ChordPro automatically.</p>
        </div>
      </div>
    </div>, document.body,
  );
}
