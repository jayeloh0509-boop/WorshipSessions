import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { useLocalSetlists } from '../hooks/useLocalSetlists';
import { SetlistCard } from '../components/SetlistCard';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import type { SetlistListItem } from '../types';
import { getSessionItem, setSessionItem } from '../lib/storage';

interface SetlistsViewProps {
  navigate: (view: string, params?: Record<string, string>) => void;
  initialTab?: string;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = startOfDay(new Date(dateStr + 'T00:00:00'));
  const today = startOfDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function dateBadgeLabel(dateStr: string | null | undefined): { month: string; day: string; countdown: string; countdownKind: 'today' | 'soon' | 'later' | 'past' | 'none' } {
  if (!dateStr) return { month: '', day: '', countdown: '', countdownKind: 'none' };
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const day = String(d.getDate()).padStart(2, '0');
  const days = daysUntil(dateStr);
  let countdown = '';
  let countdownKind: 'today' | 'soon' | 'later' | 'past' | 'none' = 'none';
  if (days === 0) {
    countdown = 'Today';
    countdownKind = 'today';
  } else if (days !== null && days > 0) {
    countdown = days === 1 ? 'Tomorrow' : `in ${days} days`;
    countdownKind = days <= 7 ? 'soon' : 'later';
  } else if (days !== null && days < 0) {
    const ago = Math.abs(days);
    countdown = ago === 1 ? 'Yesterday' : `${ago}d ago`;
    countdownKind = 'past';
  }
  return { month, day, countdown, countdownKind };
}

export function SetlistsView({ navigate }: SetlistsViewProps) {
  const apiCall = useApi();
  const { user } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const ls = useLocalSetlists();

  const activeTab = user ? 'cloud' : 'local';

  const [setlists, setSetlists] = useState<SetlistListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [query, setQuery] = useState(() => getSessionItem('cv_setlists_query') || '');
  const [dateFrom, setDateFrom] = useState(() => getSessionItem('cv_setlists_date_from') || '');
  const [dateTo, setDateTo] = useState(() => getSessionItem('cv_setlists_date_to') || '');
  const [showDates, setShowDates] = useState(() => getSessionItem('cv_setlists_show_dates') === 'true');
  const [showPast, setShowPast] = useState(false);
  const [page, setPage] = useState(() => {
    const saved = getSessionItem('cv_setlists_page');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [totalPages, setTotalPages] = useState(1);
  const nameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (q = '', from = '', to = '', targetPage = 1) => {
      if (!user) return;
      const params: string[] = [];
      if (q) params.push(`q=${encodeURIComponent(q)}`);
      if (from) params.push(`date_from=${encodeURIComponent(from)}`);
      if (to) params.push(`date_to=${encodeURIComponent(to)}`);
      params.push(`page=${targetPage}`);
      params.push(`limit=20`);
      const qs = params.length > 0 ? `?${params.join('&')}` : '';
      try {
        interface PaginatedSetlistsResponse {
          setlists: SetlistListItem[];
          total: number;
          page: number;
          limit: number;
          totalPages: number;
        }
        const data = await apiCall<PaginatedSetlistsResponse>('GET', `/api/setlists${qs}`);
        setSetlists(data.setlists);
        setPage(data.page);
        setTotalPages(data.totalPages);
        setLoaded(true);

        setSessionItem('cv_setlists_query', q);
        setSessionItem('cv_setlists_date_from', from);
        setSessionItem('cv_setlists_date_to', to);
        setSessionItem('cv_setlists_page', String(data.page));
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    },
    [apiCall, toast, user],
  );

  useEffect(() => {
    if (activeTab === 'cloud') {
      load(query, dateFrom, dateTo, page);
    } else {
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, activeTab]);

  useEffect(() => {
    if (showNew && nameRef.current) nameRef.current.focus();
  }, [showNew]);

  const create = async () => {
    if (!newName.trim()) {
      toast(t('setlist.nameRequired'), 'error');
      return;
    }
    if (newName.length > 200) {
      toast('Name too long', 'error');
      return;
    }

    if (activeTab === 'local') {
      const sl = ls.create(newName.trim());
      if (!sl) {
        toast('Max 50 setlists', 'error');
        return;
      }
      toast(t('setlist.created'), 'success');
      navigate('setlist-edit', { id: sl.id });
    } else {
      try {
        const result = await apiCall<{ id: number }>('POST', '/api/setlists', { name: newName.trim() });
        toast(t('setlist.created'), 'success');
        navigate('setlist-edit', { id: String(result.id) });
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    }
  };

  const duplicateCloud = async (id: number | string, name: string) => {
    try {
      const result = await apiCall<{ id: number }>('POST', `/api/setlists/${id}/duplicate`, { name: `${name} Copy` });
      toast('Setlist duplicated', 'success');
      await load(query, dateFrom, dateTo, page);
      navigate('setlist-edit', { id: String(result.id) });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const duplicateLocal = (id: string, name: string) => {
    const copy = ls.duplicate(id, `${name} Copy`);
    if (!copy) {
      toast('Max 50 setlists', 'error');
      return;
    }
    toast('Setlist duplicated', 'success');
  };

  const handleClear = () => {
    setQuery('');
    if (activeTab === 'local') {
      setSessionItem('cv_setlists_query', '');
    } else {
      load('', dateFrom, dateTo, 1);
    }
  };

  const handleSearch = () => {
    if (activeTab === 'cloud') {
      load(query, dateFrom, dateTo, 1);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (activeTab === 'cloud') {
      load(query, dateFrom, dateTo, newPage);
      window.scrollTo(0, 0);
    }
  };

  const localSetlistsToRender = useMemo(() => {
    return query.trim()
      ? ls.setlists.filter((sl) => sl.name.toLowerCase().includes(query.toLowerCase()))
      : ls.setlists;
  }, [ls.setlists, query]);

  // Build the items shown in the list (cloud or local, normalized to a common shape)
  type DisplaySetlist = {
    id: number | string;
    name: string;
    song_count: number;
    event_date: string | null;
    visibility: string;
    username?: string;
    isLocal: boolean;
    updated_at?: string;
  };

  const displaySetlists: DisplaySetlist[] = useMemo(() => {
    if (activeTab === 'cloud') {
      return setlists.map((s) => ({
        id: s.id,
        name: s.name,
        song_count: s.song_count,
        event_date: s.event_date,
        visibility: s.visibility,
        username: s.username,
        isLocal: false,
        updated_at: s.updated_at,
      }));
    }
    return localSetlistsToRender.map((sl) => ({
      id: sl.id,
      name: sl.name,
      song_count: sl.entries.length,
      event_date: null,
      visibility: 'private',
      isLocal: true,
    }));
  }, [activeTab, setlists, localSetlistsToRender]);

  // Group setlists by recency
  const groups = useMemo(() => {
    const upcoming: DisplaySetlist[] = [];
    const drafts: DisplaySetlist[] = [];
    const past: DisplaySetlist[] = [];

    displaySetlists.forEach((sl) => {
      const d = daysUntil(sl.event_date);
      if (d === null) drafts.push(sl);
      else if (d < 0) past.push(sl);
      else upcoming.push(sl);
    });

    upcoming.sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));
    drafts.sort((a, b) => a.name.localeCompare(b.name));
    past.sort((a, b) => (b.event_date || '').localeCompare(a.event_date || ''));

    return { upcoming, drafts, past };
  }, [displaySetlists]);

  // Stats for the hero row
  const stats = useMemo(() => {
    const total = displaySetlists.length;
    const totalSongs = displaySetlists.reduce((acc, sl) => acc + (sl.song_count || 0), 0);
    const next = groups.upcoming[0];
    const nextLabel = next ? dateBadgeLabel(next.event_date).countdown : null;
    const drafts = groups.drafts.length;
    return { total, totalSongs, next, nextLabel, drafts };
  }, [displaySetlists, groups]);

  const renderCard = (sl: DisplaySetlist) => {
    if (sl.isLocal) {
      return (
        <SetlistCard
          key={sl.id}
          setlist={{
            id: sl.id,
            name: sl.name,
            visibility: 'private',
            song_count: sl.song_count,
            event_date: null,
          }}
          onClick={() => navigate('setlist-edit', { id: String(sl.id) })}
          onPrepare={() => navigate('setlist-edit', { id: String(sl.id) })}
          onDuplicate={() => duplicateLocal(String(sl.id), sl.name)}
          onPlay={() => navigate('setlist-play', { id: String(sl.id), local: '1' })}
        />
      );
    }
    return (
      <SetlistCard
        key={sl.id}
        setlist={{
          id: sl.id,
          name: sl.name,
          visibility: sl.visibility,
          song_count: sl.song_count,
          event_date: sl.event_date,
          username: sl.username,
          updated_at: sl.updated_at,
        }}
        onClick={() => navigate('setlist-edit', { id: String(sl.id) })}
        onPrepare={() => navigate('setlist-edit', { id: String(sl.id) })}
        onDuplicate={() => void duplicateCloud(sl.id, sl.name)}
        onPlay={() => navigate('setlist-play', { id: String(sl.id) })}
      />
    );
  };

  const isEmpty = displaySetlists.length === 0 && loaded;
  const hasNoUpcoming = groups.upcoming.length === 0;
  const hasNoDrafts = groups.drafts.length === 0;
  const hasNoPast = groups.past.length === 0;
  const hasAnyItems = groups.upcoming.length + groups.drafts.length > 0;

  return (
    <div className="studio-page studio-setlists">
      <div className="view-header">
        <div>
          <p className="studio-eyebrow">YOUR SETLISTS</p>
          <h1 className="view-title">{t('setlist.title')}</h1>
          <p className="studio-page-description">Prepare the flow. Leave room for the moment.</p>
        </div>
        <button className="btn btn-sm" onClick={() => setShowNew(true)}>
          {t('setlist.newSetlist')}
        </button>
      </div>

      {user && loaded && hasAnyItems && (
        <div className="setlist-stats-row" aria-label="Setlist overview">
          <div className="setlist-stat-card">
            <div className="setlist-stat-label">Setlists on this page</div>
            <div className="setlist-stat-value">{stats.total}</div>
          </div>
          <div className="setlist-stat-card">
            <div className="setlist-stat-label">Songs in these setlists</div>
            <div className="setlist-stat-value">{stats.totalSongs}</div>
          </div>
          <div className="setlist-stat-card setlist-stat-card-next">
            <div className="setlist-stat-label">Next service on this page</div>
            {stats.next ? (
              <>
                <div className="setlist-stat-value setlist-stat-value-text">
                  {new Date(stats.next.event_date + 'T00:00:00').toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <div className="setlist-stat-sub">{dateBadgeLabel(stats.next.event_date).countdown} · {stats.next.name}</div>
              </>
            ) : (
              <>
                <div className="setlist-stat-value setlist-stat-value-muted">—</div>
                <div className="setlist-stat-sub">No upcoming service</div>
              </>
            )}
          </div>
          <div className="setlist-stat-card">
            <div className="setlist-stat-label">Drafts on this page</div>
            <div className="setlist-stat-value">{stats.drafts}</div>
          </div>
        </div>
      )}

      <div className="setlist-tabs">
        <button className="setlist-tab active">My Setlists</button>
        <button className="setlist-tab" onClick={() => navigate('public-setlists')}>
          Public Setlists
        </button>
      </div>
      {!user && (
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          These setlists are saved in your browser. Sign in to create server-synced setlists.
        </p>
      )}
      {showNew && (
        <div className="search-row" style={{ marginBottom: 16 }}>
          <input
            ref={nameRef}
            type="text"
            placeholder={t('setlist.namePlaceholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
            }}
          />
          <button className="btn btn-sm" onClick={create}>
            {t('setlist.create')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}>
            {t('songEdit.cancel')}
          </button>
        </div>
      )}
      <div className="search-row">
        <div className="search-input-wrapper">
          <input
            type="search"
            placeholder={t('setlist.searchPlaceholder')}
            value={query}
            onChange={(e) => {
              const val = e.target.value;
              setQuery(val);
              if (activeTab === 'local') {
                setSessionItem('cv_setlists_query', val);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
          />
          {query && (
            <button className="search-clear-btn" onClick={handleClear} title="Clear search">
              &times;
            </button>
          )}
        </div>
        {activeTab === 'cloud' && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const next = !showDates;
              setShowDates(next);
              setSessionItem('cv_setlists_show_dates', String(next));
            }}
          >
            &#128197; Date
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={handleSearch}>
          {t('songs.search')}
        </button>
      </div>
      {activeTab === 'cloud' && showDates && (
        <div className="search-row" style={{ marginTop: -10 }}>
          <label style={{ color: 'var(--muted)', fontSize: 13, whiteSpace: 'nowrap' }}>From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <label style={{ color: 'var(--muted)', fontSize: 13, whiteSpace: 'nowrap' }}>To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      )}

      {isEmpty && (
        <EmptyState
          icon="&#127926;"
          text={user ? t('setlist.noSetlists') : 'No setlists yet'}
          action={
            user
              ? {
                  label: '+ Create your first setlist',
                  onClick: () => setShowNew(true),
                }
              : {
                  label: '+ Create a local setlist',
                  onClick: () => setShowNew(true),
                }
          }
        />
      )}

      {loaded && !isEmpty && (
        <div className="song-grid">
          {!hasNoUpcoming && (
            <>
              <div className="setlist-group-header">
                <span className="setlist-group-title">Up next</span>
                <span className="setlist-group-count">{groups.upcoming.length}</span>
              </div>
              {groups.upcoming.map(renderCard)}
            </>
          )}

          {!hasNoDrafts && (
            <>
              <div className="setlist-group-header">
                <span className="setlist-group-title">Drafts</span>
                <span className="setlist-group-count">{groups.drafts.length}</span>
              </div>
              {groups.drafts.map(renderCard)}
            </>
          )}

          {!hasNoPast && (
            <>
              <button
                className="setlist-group-header setlist-group-toggle"
                onClick={() => setShowPast((s) => !s)}
                aria-expanded={showPast}
              >
                <span className="setlist-group-title">
                  Past services
                  <span className="setlist-group-chevron" aria-hidden="true">
                    {showPast ? '▾' : '▸'}
                  </span>
                </span>
                <span className="setlist-group-count">{groups.past.length}</span>
              </button>
              {showPast && groups.past.map(renderCard)}
            </>
          )}
        </div>
      )}

      {activeTab === 'cloud' && <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />}
    </div>
  );
}
