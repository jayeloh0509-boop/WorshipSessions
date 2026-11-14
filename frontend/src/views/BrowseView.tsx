import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { LibrarySongRow } from '../components/LibrarySongRow';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import type { SongListItem } from '../types';
import { LANGUAGES } from '../lib/languages';
import { getSessionItem, setSessionItem } from '../lib/storage';
import '../styles/song-library-preview.css';
import '../styles/song-library-premium.css';

interface BrowseViewProps {
  navigate: (view: string, params?: Record<string, string>) => void;
}

export function BrowseView({ navigate }: BrowseViewProps) {
  const api = useApi();
  const { user } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [query, setQuery] = useState(() => getSessionItem('cv_browse_query') || '');
  const [langFilter, setLangFilter] = useState(() => getSessionItem('cv_browse_lang') || '');
  const [showFilters, setShowFilters] = useState(() => getSessionItem('cv_browse_show_filters') === 'true');
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(() => {
    const saved = getSessionItem('cv_browse_page');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const loadSequence = useRef(0);

  const load = useCallback(
    async (q = '', lang = '', targetPage = 1) => {
      const requestId = ++loadSequence.current;
      try {
        let url = '/api/songs/public';
        const params: string[] = [];
        if (q) params.push(`q=${encodeURIComponent(q)}`);
        if (lang) params.push(`language=${encodeURIComponent(lang)}`);
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
        const data = await api<PaginatedSongsResponse>('GET', url);
        if (requestId !== loadSequence.current) return;
        setSongs(data.songs);
        setTotal(data.total);
        setPage(data.page);
        setTotalPages(data.totalPages);
        setLoaded(true);

        setSessionItem('cv_browse_query', q);
        setSessionItem('cv_browse_lang', lang);
        setSessionItem('cv_browse_page', String(data.page));
      } catch (e) {
        if (requestId === loadSequence.current) toast((e as Error).message, 'error');
      }
    },
    [api, toast],
  );

  useEffect(() => {
    load(query, langFilter, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const handleClear = () => {
    setQuery('');
    load('', langFilter, 1);
  };

  const doSearch = () => load(query, langFilter, 1);

  const handlePageChange = (newPage: number) => {
    load(query, langFilter, newPage);
    window.scrollTo(0, 0);
  };

  const showHero = !user && !query && !langFilter && loaded && songs.length === 0 && page === 1;

  return (
    <section className="studio-library studio-browse song-library-clean-preview song-library-premium-preview" aria-label="Shared song library">
      {showHero ? (
        <div className="hero">
          <div className="hero-kicker">WORSHIP WORKSPACE</div>
          <div className="hero-title">&#9833; WorshipSessions</div>
          <div className="hero-tagline">Charts, Keys, Setlists.</div>
          <div className="hero-cta">Organize your music, prepare your team, and stay focused while you lead.</div>
          <div className="hero-features" aria-label="WorshipSessions features">
            <span>♪ Clear chord charts</span>
            <span>◈ Simple setlists</span>
            <span>▣ Focused Live Mode</span>
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn" onClick={() => navigate('auth')}>
              {t('auth.signIn')}
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('about')}>
              Learn more
            </button>
          </div>
        </div>
      ) : (
        <>
          <header className="clean-library-header">
            <div><p className="clean-library-eyebrow studio-eyebrow">THE SHARED LIBRARY</p><h1 className="clean-library-title">Songs</h1>
              <p className="studio-subtitle">Find the song. Make room for the moment.</p></div>
            {user && <div className="clean-library-actions"><button type="button" className="clean-library-add" onClick={() => navigate('song-edit')}><span aria-hidden="true">+</span> New Song</button></div>}
          </header>
          <form className="clean-library-search" onSubmit={(event) => { event.preventDefault(); doSearch(); }}>
            <div className="clean-library-search-input">
              <input
                type="search"
                aria-label="Search songs by title or artist"
                placeholder={t('songs.searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button type="button" className="clean-library-clear" onClick={handleClear} aria-label="Clear search">
                  &times;
                </button>
              )}
            </div>
            <button type="submit" className="clean-library-search-submit" aria-label="Search songs" title="Search songs">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.5 15.5 4.2 4.2" /></svg>
            </button>
            <button
              type="button"
              className={`clean-library-filter-toggle${showFilters || langFilter ? ' active' : ''}`}
              onClick={() => {
                const next = !showFilters;
                setShowFilters(next);
                setSessionItem('cv_browse_show_filters', String(next));
              }}
              title="Language filters"
              aria-label="Filter songs"
              aria-expanded={showFilters}
              aria-controls="browse-song-filters"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" />
              </svg>
            </button>

          </form>
          {showFilters && (
            <div id="browse-song-filters" className="clean-library-filter-panel" role="region" aria-label="Song filters">
              <select
                className="language-filter"
                aria-label="Language"
                value={langFilter}
                onChange={(e) => {
                  setLangFilter(e.target.value);
                  load(query, e.target.value, 1);
                }}
              >
                <option value="">All languages</option>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="clean-library-count" aria-live="polite">{loaded ? `${total} songs · Page ${page} of ${Math.max(1, totalPages)}` : 'Loading songs…'}</div>
          <div className="clean-library-rows" role="list">
            {loaded && songs.length === 0 ? (
              <EmptyState icon="&#128269;" text={query || langFilter ? t('songs.noMatches', 'No songs match your filters.') : t('songs.noPublicSongs')} />
            ) : (
              songs.map((s) => (
                <LibrarySongRow
                  key={s.id}
                  song={s}
                  onOpen={() => navigate('song-view', { id: String(s.id) })}
                  onEdit={user?.username === s.username ? () => navigate('song-edit', { id: String(s.id) }) : undefined}
                />
              ))
            )}
          </div>
          {totalPages > 1 && <div className="clean-library-pagination"><Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} /></div>}
        </>
      )}
    </section>
  );
}
