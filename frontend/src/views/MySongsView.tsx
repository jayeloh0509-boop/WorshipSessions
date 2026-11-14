import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { SongCard } from '../components/SongCard';
import { LibrarySongRow } from '../components/LibrarySongRow';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import type { SongListItem } from '../types';
import { getSessionItem, setSessionItem, getStoredUser } from '../lib/storage';
import { LANGUAGES } from '../lib/languages';
import '../styles/library-rehearsal.css';
import '../styles/song-library-preview.css';
import '../styles/song-library-premium.css';

interface MySongsViewProps {
  navigate: (view: string, params?: Record<string, string>) => void;
  compactPreview?: boolean;
  previewVariant?: 'clean' | 'premium';
}

interface PaginatedSongsResponse {
  songs: SongListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PREVIEW_PAGE_SIZE = 20;
const PREVIEW_FETCH_LIMIT = 100;
const COLLECTION_FETCH_CONCURRENCY = 4;

export function MySongsView({ navigate, compactPreview = false, previewVariant = 'premium' }: MySongsViewProps) {
  const isPremiumLayout = previewVariant === 'premium';
  const usesLibraryPresentation = compactPreview || isPremiumLayout;
  const api = useApi();
  const { t } = useI18n();
  const toast = useToast();
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'favorites' | 'recent'>('all');
  const collectionMode = compactPreview || libraryFilter !== 'all';
  const [query, setQuery] = useState(() => getSessionItem('cv_mysongs_query') || '');
  const [languageFilter, setLanguageFilter] = useState(() =>
    usesLibraryPresentation ? getSessionItem('cv_mysongs_preview_language') || '' : '',
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(() => {
    const saved = getSessionItem('cv_mysongs_page');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [resultsRevision, setResultsRevision] = useState(0);
  const loadSequence = useRef(0);
  const [health, setHealth] = useState<
    { id: number; title: string; artist: string; review: { status: string; warnings: { message: string }[] } }[] | null
  >(null);
  const [healthBusy, setHealthBusy] = useState(false);

  const load = useCallback(
    async (q = '', language = '', targetPage = 1) => {
      const requestId = ++loadSequence.current;
      const pageSize = collectionMode ? PREVIEW_FETCH_LIMIT : PREVIEW_PAGE_SIZE;
      const buildUrl = (requestPage: number) => {
        const params: string[] = [];
        if (q.trim()) params.push(`q=${encodeURIComponent(q.trim())}`);
        if (language) params.push(`language=${encodeURIComponent(language)}`);
        params.push(`page=${requestPage}`);
        params.push(`limit=${pageSize}`);
        return `/api/songs?${params.join('&')}`;
      };

      try {
        const firstPage = await api<PaginatedSongsResponse>('GET', buildUrl(collectionMode ? 1 : targetPage));
        const laterPages: PaginatedSongsResponse[] = [];
        if (collectionMode) {
          for (let start = 2; start <= firstPage.totalPages; start += COLLECTION_FETCH_CONCURRENCY) {
            if (requestId !== loadSequence.current) return;
            const end = Math.min(firstPage.totalPages, start + COLLECTION_FETCH_CONCURRENCY - 1);
            const batch = await Promise.all(
              Array.from({ length: end - start + 1 }, (_, index) =>
                api<PaginatedSongsResponse>('GET', buildUrl(start + index)),
              ),
            );
            laterPages.push(...batch);
          }
        }
        if (requestId !== loadSequence.current) return;

        const completeCollection = [firstPage.songs, ...laterPages.map((result) => result.songs)].flat();
        setSongs(completeCollection);
        const previewPageCount = Math.max(1, Math.ceil(completeCollection.length / PREVIEW_PAGE_SIZE));
        const resolvedPage = collectionMode ? Math.min(Math.max(1, targetPage), previewPageCount) : firstPage.page;
        setPage(resolvedPage);
        setTotalPages(firstPage.totalPages);
        setLoaded(true);
        setResultsRevision((revision) => revision + 1);
        setSessionItem('cv_mysongs_query', q);
        setSessionItem('cv_mysongs_page', String(resolvedPage));
        if (usesLibraryPresentation) setSessionItem('cv_mysongs_preview_language', language);
      } catch (error) {
        if (requestId === loadSequence.current) toast((error as Error).message, 'error');
      }
    },
    [api, toast, collectionMode, usesLibraryPresentation],
  );

  useEffect(() => {
    load(query, languageFilter, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const handleClear = () => {
    setQuery('');
    setPage(1);
    load('', languageFilter, 1);
  };

  const doSearch = () => {
    setPage(1);
    load(query, languageFilter, 1);
  };

  const handlePageChange = (newPage: number) => {
    if (collectionMode) {
      setPage(newPage);
      setSessionItem('cv_mysongs_page', String(newPage));
      setResultsRevision((revision) => revision + 1);
    } else {
      load(query, languageFilter, newPage);
    }
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
  const [favorites, setFavorites] = useState<number[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(`cv_favorites:${userScope}`) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const recentSongIds = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(`cv_recent_songs:${userScope}`) || '[]');
      return Array.isArray(parsed) ? (parsed as number[]) : [];
    } catch {
      return [];
    }
  })();
  const filteredSongs = songs.filter((song) => {
    if (libraryFilter === 'favorites') return favorites.includes(song.id);
    if (libraryFilter === 'recent') return recentSongIds.includes(song.id);
    return true;
  });
  if (libraryFilter === 'recent') filteredSongs.sort((a, b) => recentSongIds.indexOf(a.id) - recentSongIds.indexOf(b.id));
  const visibleSongs = collectionMode
    ? filteredSongs.slice((page - 1) * PREVIEW_PAGE_SIZE, page * PREVIEW_PAGE_SIZE)
    : filteredSongs;
  const totalPagesForView = collectionMode
    ? Math.max(1, Math.ceil(filteredSongs.length / PREVIEW_PAGE_SIZE))
    : totalPages;
  const toggleFavorite = (id: number) => {
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
    setFavorites(next);
    if (collectionMode) {
      setPage(1);
      setSessionItem('cv_mysongs_page', '1');
    }
    if (libraryFilter === 'favorites') setResultsRevision((revision) => revision + 1);
    try {
      localStorage.setItem(`cv_favorites:${userScope}`, JSON.stringify(next));
    } catch {
      /* best effort */
    }
  };
  const openSong = (id: number) => {
    try {
      const key = `cv_recent_songs:${userScope}`;
      const previous = JSON.parse(localStorage.getItem(key) || '[]') as number[];
      localStorage.setItem(key, JSON.stringify([id, ...previous.filter((value) => value !== id)].slice(0, 12)));
    } catch {
      /* best effort */
    }
    navigate('song-view', { id: String(id) });
  };

  const selectLibraryFilter = (filter: 'all' | 'favorites' | 'recent') => {
    if (libraryFilter === filter) return;
    setLibraryFilter(filter);
    setPage(1);
    setSessionItem('cv_mysongs_page', '1');
    setResultsRevision((revision) => revision + 1);
  };

  const filterPanel = (
    <div id="clean-library-filters" className="clean-library-filter-panel" role="region" aria-label="Song filters">
      <label htmlFor="clean-library-language">Language</label>
      <select
        id="clean-library-language"
        value={languageFilter}
        disabled={!filtersOpen}
        onChange={(event) => {
          const nextLanguage = event.target.value;
          setLanguageFilter(nextLanguage);
          setPage(1);
          load(query, nextLanguage, 1);
        }}
      >
        <option value="">All languages</option>
        {LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.name}
          </option>
        ))}
      </select>
    </div>
  );

  if (compactPreview || isPremiumLayout) {
    // The active tab decides the empty state: a Favorites/Recently view is empty for
    // its own reason, so it must not claim the search found nothing.
    const emptyText =
      libraryFilter === 'favorites'
        ? favorites.length === 0
          ? 'No favorites yet. Tap the star on a song to save it here.'
          : query.trim()
            ? 'No favorites match your search.'
            : languageFilter
              ? 'No favorites match this language filter.'
              : 'No matching favorites in this collection.'
        : libraryFilter === 'recent'
          ? recentSongIds.length === 0
            ? 'No recently played songs yet.'
            : query.trim()
              ? 'No recently played songs match your search.'
              : languageFilter
                ? 'No recently played songs match this language filter.'
                : 'No matching recently played songs in this collection.'
          : query.trim() && languageFilter
            ? 'No songs match this search and language.'
            : query.trim()
              ? t('songs.noMatches', 'No songs match your search.')
              : languageFilter
                ? 'No songs match this language filter.'
                : t('songs.noSongs');

    return (
      <section
        className={`studio-library studio-my-songs song-library-clean-preview${previewVariant === 'premium' ? ' song-library-premium-preview' : ''}`}
        aria-labelledby="clean-library-title"
      >
        <header className="clean-library-header">
          <div>
            <div className="clean-library-eyebrow studio-eyebrow">YOUR COLLECTION</div>
            <h1 id="clean-library-title" className="clean-library-title">
              {t('songs.mySongs')}
            </h1>
            <p className="studio-subtitle">Your charts, ready for the next session.</p>
          </div>
          <div className="clean-library-actions">
            <button
              type="button"
              className="clean-library-scan"
              aria-label={healthBusy ? 'Scanning library' : 'Scan library'}
              title={healthBusy ? 'Scanning library' : 'Scan library health'}
              onClick={scanLibrary}
              disabled={healthBusy}
            >
              <span className="clean-library-scan-icon" aria-hidden="true">↻</span>
              <span className="clean-library-scan-label">{healthBusy ? 'Scanning…' : 'Scan library'}</span>
            </button>
            <button
              type="button"
              className="clean-library-add"
              aria-label="New Song"
              onClick={() => navigate('song-edit')}
            >
              <span className="clean-library-add-icon" aria-hidden="true">
                +
              </span>
              {t('songs.newSong').replace(/^\s*\+\s*/, '')}
            </button>
          </div>
        </header>

        <form
          className="clean-library-search"
          onSubmit={(event) => {
            event.preventDefault();
            doSearch();
          }}
        >
          <div className="clean-library-search-input">
            <input
              type="search"
              aria-label="Search songs by title or artist"
              placeholder={t('songs.searchPlaceholder')}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
                setSessionItem('cv_mysongs_page', '1');
              }}
            />
            {query && (
              <button type="button" className="clean-library-clear" aria-label="Clear search" onClick={handleClear}>
                ×
              </button>
            )}
          </div>
          <button type="submit" className="clean-library-search-submit" aria-label="Search songs" title="Search songs">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="10.8" cy="10.8" r="6.3" />
              <path d="m15.5 15.5 4.2 4.2" />
            </svg>
          </button>
          <button
            type="button"
            className={`clean-library-filter-toggle${filtersOpen || languageFilter ? ' active' : ''}`}
            aria-label="Filter songs"
            aria-expanded={filtersOpen}
            aria-controls="clean-library-filters"
            title="Filter songs by language"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" />
            </svg>
          </button>
        </form>

        {previewVariant === 'premium' ? (
          <div className={`clean-library-filter-shell${filtersOpen ? ' open' : ''}`} aria-hidden={!filtersOpen}>
            {filterPanel}
          </div>
        ) : filtersOpen ? (
          filterPanel
        ) : null}

        <div
          className="clean-library-tabs"
          role="tablist"
          aria-label="Song library views"
          data-active-tab={libraryFilter}
        >
          {(['all', 'favorites', 'recent'] as const).map((filter) => (
            <button
              key={filter}
              id={`clean-library-tab-${filter}`}
              type="button"
              role="tab"
              aria-selected={libraryFilter === filter}
              aria-controls="clean-library-results"
              className={`clean-library-tab${libraryFilter === filter ? ' active' : ''}`}
              onClick={() => selectLibraryFilter(filter)}
            >
              {filter === 'all' ? 'All songs' : filter === 'favorites' ? '★ Favorites' : 'Recently played'}
            </button>
          ))}
          <span className="clean-library-tab-indicator" aria-hidden="true" />
        </div>

        <div className="clean-library-count" aria-live="polite">
          {visibleSongs.length} shown
        </div>

        <section
          key={resultsRevision}
          id="clean-library-results"
          className="clean-library-results"
          role="tabpanel"
          aria-labelledby={`clean-library-tab-${libraryFilter}`}
          tabIndex={0}
        >
          <div className="clean-library-rows" role="list">
            {loaded && visibleSongs.length === 0 ? (
              <div className="clean-library-empty" role="status">
                <span className="clean-library-empty-icon" aria-hidden="true">
                  ⌕
                </span>
                <p>{emptyText}</p>
                {!query.trim() && !languageFilter && libraryFilter === 'all' && (
                  <button type="button" className="clean-library-empty-action" onClick={() => navigate('song-edit')}>
                    {t('songs.addFirst')}
                  </button>
                )}
              </div>
            ) : !loaded ? (
              <div className="clean-library-loading" role="status">
                Loading songs…
              </div>
            ) : (
              visibleSongs.map((song) => {
                const isFavorite = favorites.includes(song.id);
                return (
                  <LibrarySongRow
                    key={song.id}
                    song={song}
                    onOpen={() => openSong(song.id)}
                    onEdit={() => navigate('song-edit', { id: String(song.id) })}
                    isFavorite={isFavorite}
                    onToggleFavorite={() => toggleFavorite(song.id)}
                  />
                );
              })
            )}
          </div>
        </section>
        {health && (
          <div className="clean-library-health" data-testid="library-health">
            <h3>Library health</h3>
            <p>
              {health.filter((song) => song.review.status === 'verified').length} with no structural warnings ·{' '}
              {health.filter((song) => song.review.status !== 'verified').length} need review
            </p>
            {health
              .filter((song) => song.review.status !== 'verified')
              .map((song) => (
                <button
                  key={song.id}
                  className="clean-library-health-row"
                  onClick={() => navigate('song-edit', { id: String(song.id) })}
                  title="Open chart editor for review"
                >
                  <span>{song.title}{song.artist ? ` — ${song.artist}` : ''}</span>
                  <span>{song.review.warnings.map((warning) => warning.message).join(' ')}</span>
                </button>
              ))}
          </div>
        )}
        {totalPagesForView > 1 && (
          <div className="clean-library-pagination">
            <Pagination page={page} totalPages={totalPagesForView} onPageChange={handlePageChange} />
          </div>
        )}
      </section>
    );
  }

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
            <button
              key={filter}
              type="button"
              role="tab"
              aria-selected={libraryFilter === filter}
              className={`library-filter ${libraryFilter === filter ? 'active' : ''}`}
              onClick={() => setLibraryFilter(filter)}
            >
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
              <button
                type="button"
                className={`library-favorite ${favorites.includes(s.id) ? 'active' : ''}`}
                aria-label={`${favorites.includes(s.id) ? 'Remove' : 'Add'} ${s.title} ${favorites.includes(s.id) ? 'from' : 'to'} favorites`}
                onClick={() => toggleFavorite(s.id)}
              >
                {favorites.includes(s.id) ? '★' : '☆'}
              </button>
            </div>
          ))
        )}
      </div>
      {health && (
        <div className="card" style={{ marginTop: 20 }} data-testid="library-health">
          <h3>Library health</h3>
          <p className="muted-text">
            {health.filter((s) => s.review.status === 'verified').length} with no structural warnings ·{' '}
            {health.filter((s) => s.review.status !== 'verified').length} need review
          </p>
          {health
            .filter((s) => s.review.status !== 'verified')
            .map((song) => (
              <button
                key={song.id}
                className="list-row library-health-row"
                onClick={() => navigate('song-edit', { id: String(song.id) })}
                title="Open chart editor for review"
              >
                <span>
                  {song.title}
                  {song.artist ? ` — ${song.artist}` : ''}
                </span>
                <span className="text-warning">{song.review.warnings.map((w) => w.message).join(' ')}</span>
              </button>
            ))}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
    </>
  );
}
