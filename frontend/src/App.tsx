import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { useDemo } from './context/DemoContext';
import { Nav } from './components/Nav';
import { DemoBanner } from './components/DemoBanner';
import { Toast } from './components/Toast';

import { BrowseView } from './views/BrowseView';
import { MySongsView } from './views/MySongsView';
import { SongView } from './views/SongView';
import { SongEditView } from './views/SongEditView';
import { CorrectionView } from './views/CorrectionView';
import { AuthView } from './views/AuthView';
import { SetlistsView } from './views/SetlistsView';
import { PublicSetlistsView } from './views/PublicSetlistsView';
import { SetlistEditView } from './views/SetlistEditView';
import { SetlistPlayView } from './views/SetlistPlayView';
import { AdminView } from './views/AdminView';
import { SettingsView } from './views/SettingsView';
import { AboutView } from './views/AboutView';
import { ToolsView } from './views/ToolsView';
import { KeyFinderView } from './views/KeyFinderView';
import { CapoCalculatorView } from './views/CapoCalculatorView';
import { TransposeView } from './views/TransposeView';
import { NashvilleView } from './views/NashvilleView';
import { RelativeKeyView } from './views/RelativeKeyView';
import { DiatonicChordsView } from './views/DiatonicChordsView';
import { api } from './lib/api';
import type { AuthConfig, Setlist } from './types';

interface Route {
  view: string;
  params: Record<string, string>;
}

// Stable hash slug <-> view name for every tool page
export const TOOL_ROUTES: Record<string, string> = {
  'key-finder': 'tools-key-finder',
  'capo': 'tools-capo',
  'transpose': 'tools-transpose',
  'nashville': 'tools-nashville',
  'relative-keys': 'tools-relative',
  'diatonic': 'tools-diatonic',
};

const TOOL_HASHES: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_ROUTES).map(([slug, view]) => [view, `#tools/${slug}`])
);

export function parseHash(): Route {
  const hash = location.hash.slice(1); // remove #
  if (!hash) return { view: 'browse', params: {} };

  // #tools and #tools/<slug>; unknown tool slugs fall back to the launcher
  if (hash === 'tools') return { view: 'tools', params: {} };
  if (hash.startsWith('tools/')) {
    const view = TOOL_ROUTES[hash.slice('tools/'.length)];
    return { view: view || 'tools', params: {} };
  }

  // #song/42
  const songMatch = hash.match(/^song\/(\d+)$/);
  if (songMatch) return { view: 'song-view', params: { id: songMatch[1] } };

  // #setlist/42/play or #setlist/local_123/play
  const playMatch = hash.match(/^setlist\/(local_\w+|\d+)\/play(?:\/(\d+))?$/);
  if (playMatch) {
    return {
      view: 'setlist-play',
      params: {
        id: playMatch[1],
        ...(playMatch[1].startsWith('local_') ? { local: '1' } : {}),
        ...(playMatch[2] ? { index: playMatch[2] } : {}),
      },
    };
  }

  // #setlist/42 or #setlist/local_123
  const setlistMatch = hash.match(/^setlist\/(local_\w+|\d+)$/);
  if (setlistMatch) {
    return {
      view: 'setlist-edit',
      params: {
        id: setlistMatch[1],
      },
    };
  }

  return { view: 'browse', params: {} };
}

export function App() {
  const { user, isAdmin } = useAuth();
  const { setDemoMode } = useDemo();
  const [route, setRoute] = useState<Route>(() => parseHash());
  const [animClass, setAnimClass] = useState('');

  useEffect(() => {
    api<AuthConfig>('GET', '/api/auth/config').then((cfg) => {
      if (cfg.demoMode) setDemoMode(true);
    }).catch(() => {});
  }, [setDemoMode]);

  // Auto-scroll to top when any overlay appears
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLElement && node.hasAttribute('data-overlay')) {
            window.scrollTo(0, 0);
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Listen for hash changes
  useEffect(() => {
    const onHashChange = () => {
      const newRoute = parseHash();
      setRoute((prev) => {
        const isSameView = prev.view === newRoute.view;
        const isSameParams =
          Object.keys(prev.params).length === Object.keys(newRoute.params).length &&
          Object.keys(prev.params).every((k) => prev.params[k] === newRoute.params[k]);

        return isSameView && isSameParams ? prev : newRoute;
      });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((view: string, params: Record<string, string> = {}) => {
    // Trigger animation
    setAnimClass('');
    requestAnimationFrame(() => {
      setRoute({ view, params });
      setAnimClass('view-enter');
    });

    // Update hash for deep-linkable views
    if (view === 'song-view' && params.id) location.hash = `#song/${params.id}`;
    else if (view === 'tools') location.hash = '#tools';
    else if (TOOL_HASHES[view]) location.hash = TOOL_HASHES[view];
    else if (view === 'setlist-edit' && params.id) {
      location.hash = `#setlist/${params.id}`;
    }
    else if (view === 'setlist-play' && params.id) {
      let h = `#setlist/${params.id}/play`;
      if (params.index && params.index !== '0') h += `/${params.index}`;
      location.hash = h;
    }
    else if (['browse', 'my-songs', 'setlists', 'admin', 'settings', 'auth', 'about', 'public-setlists'].includes(view)) {
      // Use replaceState to clear hash without triggering hashchange (which would race with the rAF setRoute above)
      history.replaceState(null, '', location.pathname + location.search);
    }
  }, []);



  if (!user) {
    return (
      <>
        <main id="app">
          <AuthView navigate={navigate} />
        </main>
        <Toast />
      </>
    );
  }

  const renderView = () => {
    const { view, params } = route;

    switch (view) {
      case 'browse':
        return <BrowseView navigate={navigate} />;
      case 'my-songs':
        return user ? <MySongsView navigate={navigate} /> : <BrowseView navigate={navigate} />;
      case 'song-view':
        return params.id ? <SongView songId={parseInt(params.id)} navigate={navigate} /> : <BrowseView navigate={navigate} />;
      case 'song-edit':
        return <SongEditView songId={params.id ? parseInt(params.id) : undefined} navigate={navigate} />;
      case 'correction':
        return params.id ? <CorrectionView songId={parseInt(params.id)} navigate={navigate} /> : <BrowseView navigate={navigate} />;
      case 'auth':
        return <AuthView navigate={navigate} />;
      case 'setlists':
        return <SetlistsView navigate={navigate} />;
      case 'public-setlists':
        return <PublicSetlistsView navigate={navigate} />;
      case 'setlist-edit':
        return params.id ? (
          <SetlistEditView
            setlistId={params.id.startsWith('local_') ? params.id : parseInt(params.id)}
            navigate={navigate}
          />
        ) : <SetlistsView navigate={navigate} />;
      case 'setlist-play': {
        if (params._setlist) {
          // Local setlist play with pre-loaded data
          try {
            const sl = JSON.parse(params._setlist) as Setlist;
            const initialIdx = params.index ? parseInt(params.index) : undefined;
            return <SetlistPlayView setlistId={sl.id} isLocal initialSetlist={sl} initialIndex={initialIdx} navigate={navigate} />;
          } catch { /* fall through */ }
        }
        const initialIdx = params.index ? parseInt(params.index) : undefined;
        return params.id ? (
          <SetlistPlayView
            setlistId={params.id.startsWith('local_') ? params.id : parseInt(params.id)}
            isLocal={!!params.local || params.id.startsWith('local_')}
            initialIndex={initialIdx}
            navigate={navigate}
          />
        ) : <SetlistsView navigate={navigate} />;
      }
      case 'admin':
        return <AdminView navigate={navigate} />;
      case 'settings':
        if (isAdmin) return <SettingsView />;
        return user ? <MySongsView navigate={navigate} /> : <BrowseView navigate={navigate} />;
      case 'about':
        return <AboutView navigate={navigate} />;
      case 'tools':
        return <ToolsView navigate={navigate} />;
      case 'tools-key-finder':
        return <KeyFinderView navigate={navigate} />;
      case 'tools-capo':
        return <CapoCalculatorView navigate={navigate} />;
      case 'tools-transpose':
        return <TransposeView navigate={navigate} />;
      case 'tools-nashville':
        return <NashvilleView navigate={navigate} />;
      case 'tools-relative':
        return <RelativeKeyView navigate={navigate} />;
      case 'tools-diatonic':
        return <DiatonicChordsView navigate={navigate} />;
      default:
        return <BrowseView navigate={navigate} />;
    }
  };

  return (
    <>
      <DemoBanner />
      {route.view !== 'setlist-play' && <Nav view={route.view} navigate={navigate} />}
      <main
        id="app"
        className={`${animClass}${route.view !== 'setlist-play' ? ' app-with-nav' : ''}`.trim()}
      >
        {renderView()}
      </main>
      <Toast />
    </>
  );
}
