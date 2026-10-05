import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { SongCard } from '../components/SongCard';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import type { SongListItem } from '../types';
import { getSessionItem, setSessionItem, getStoredUser } from '../lib/storage';
import '../styles/library-rehearsal.css';

interface MySongsViewProps {
  navigate: (view: string, params?: Record<string, string>) => void;
}

export function MySongsView({ navigate }: MySongsViewProps) {
  const api = useApi();
  const { t } = useI18n();
  const toast = useToast();
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [query, setQuery] = useState(() => getSessionItem('cv_mysongs_query') || '');
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(() => {
    const saved = getSessionItem('cv_mysongs_page');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [health, setHealth] = useState<{ id: number; title: string; artist: string; review: { status: string; warnings: { message: string }[] } }[] | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);

  const load = useCallback(
    (q = '', targetPage = 1) => {
      let url = '/api/songs';
      const params: string[] = [];
      if (q.trim()) params.push(`q=${encodeURIComponent(q.trim())}`);
      params.push(`page=${targetPage}`);
      params.push(`limit=20`);
      url += '?' + params.join('&');

      interface PaginatedSongsResponse {
        songs: SongListItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }

      api<PaginatedSongsResponse>('GET', url)
        .then((data) => {
          setSongs(data.songs);
          setPage(data.page);
          setTotalPages(data.totalPages);
          setLoaded(true);
          setSessionItem('cv_mysongs_query', q);
          setSessionItem('cv_mysongs_page', String(data.page));
        })
        .catch((e) => toast(e.message, 'error'));
    },
    [api, toast],
  );

  useEffect(() => {
    load(query, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const handleClear = () => {
    setQuery('');
    load('', 1);
  };

  const doSearch = () => load(query, 1);

  const handlePageChange = (newPage: number) => {
    load(query, newPage);
    window.scrollTo(0, 0);
  };

  const scanLibrary = async () => {
    setHealthBusy(true);
    try {
      const data = await api<{ songs: NonNullable<typeof health> }>('GET', '/api/songs/health');
      setHealth(data.songs);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setHealthBusy(false);
    }
  };

  const userScope = getStoredUser()?.id ? String(getStoredUser()?.id) : 'guest';
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'favorites' | 'recent'>('all');
  const [favorites, setFavorites] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem(`cv_favorites:${userScope}`) || '[]'); } catch { return []; }
  });
  const visibleSongs = songs.filter((song) => {
    if (libraryFilter === 'favorites') return favorites.includes(song.id);
    if (libraryFilter === 'recent') {
      try { return (JSON.parse(localStorage.getItem(`cv_recent_songs:${userScope}`) || '[]') as number[]).includes(song.id); } catch { return false; }
    }
    return true;
  });
  const toggleFavorite = (id: number) => {
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
    setFavorites(next);
    try { localStorage.setItem(`cv_favorites:${userScope}`, JSON.stringify(next)); } catch { /* best effort */ }
  };
  const openSong = (id: number) => {
    try {
      const key = `cv_recent_songs:${userScope}`;
      const previous = JSON.parse(localStorage.getItem(key) || '[]') as number[];
      localStorage.setItem(key, JSON.stringify([id, ...previous.filter((value) => value !== id)].slice(0, 12)));
    } catch { /* best effort */ }
    navigate('song-view', { id: String(id) });
  };

  return (
    <>
      <div className="view-header">
        <h2 className="view-title">{t('songs.mySongs')}</h2>
      </div>
      <div className="search-row">
        <div className="search-input-wrapper">
          <input
            type="search"
            placeholder={t('songs.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doSearch();
            }}
          />
          {query && (
            <button className="search-clear-btn" onClick={handleClear} title="Clear search">
              &times;
            </button>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={doSearch}>
          {t('songs.search')}
        </button>
        <button className="btn btn-sm" onClick={() => navigate('song-edit')}>
          {t('songs.newSong')}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={scanLibrary} disabled={healthBusy}>
          {healthBusy ? 'Scanning…' : 'Scan library'}
        </button>
      </div>
      <div className="library-toolbar" aria-label="Library views">
        <div className="library-filter-group" role="tablist">
          {(['all', 'favorites', 'recent'] as const).map((filter) => (
            <button key={filter} type="button" role="tab" aria-selected={libraryFilter === filter} className={`library-filter ${libraryFilter === filter ? 'active' : ''}`} onClick={() => setLibraryFilter(filter)}>
              {filter === 'all' ? 'All songs' : filter === 'favorites' ? '★ Favorites' : 'Recently played'}
            </button>
          ))}
        </div>
        <span className="library-count">{visibleSongs.length} shown</span>
      </div>
      <div className="song-grid">
        {loaded && visibleSongs.length === 0 ? (
          <EmptyState
            icon="&#127928;"
            text={query ? t('songs.noMatches') : t('songs.noSongs')}
            action={!query ? { label: t('songs.addFirst'), onClick: () => navigate('song-edit') } : undefined}
          />
        ) : (
          visibleSongs.map((s) => (
            <div className="library-song-row" key={s.id}>
              <SongCard
                song={s}
                isOwner
                onClick={() => openSong(s.id)}
                onEdit={() => navigate('song-edit', { id: String(s.id) })}
              />
              <button type="button" className={`library-favorite ${favorites.includes(s.id) ? 'active' : ''}`} aria-label={`${favorites.includes(s.id) ? 'Remove' : 'Add'} ${s.title} ${favorites.includes(s.id) ? 'from' : 'to'} favorites`} onClick={() => toggleFavorite(s.id)}>
                {favorites.includes(s.id) ? '★' : '☆'}
              </button>
            </div>
          ))
        )}
      </div>
      {health && (
        <div className="card" style={{ marginTop: 20 }} data-testid="library-health">
          <h3>Library health</h3>
          <p className="muted-text">{health.filter((s) => s.review.status === 'verified').length} verified · {health.filter((s) => s.review.status !== 'verified').length} need review</p>
          {health.filter((s) => s.review.status !== 'verified').map((song) => (
            <button
              key={song.id}
              className="list-row library-health-row"
              onClick={() => navigate('song-edit', { id: String(song.id) })}
              title="Open chart editor for review"
            >
              <span>{song.title}{song.artist ? ` — ${song.artist}` : ''}</span>
              <span className="text-warning">{song.review.warnings.map((w) => w.message).join(' ')}</span>
            </button>
          ))}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
    </>
  );
}
