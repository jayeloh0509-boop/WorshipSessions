import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import logoSvg from '../assets/logo.svg?raw';

interface NavProps {
  view: string;
  navigate: (view: string, params?: Record<string, string>) => void;
}

const TOOL_ITEMS = [
  { view: 'tools-key-finder', label: 'Song Key Finder' },
  { view: 'tools-transpose', label: 'Transpose' },
  { view: 'tools-capo', label: 'Capo Chart' },
  { view: 'tools-nashville', label: 'Nashville Numbers' },
  { view: 'tools-relative', label: 'Relative Keys' },
  { view: 'tools-diatonic', label: 'Diatonic Chords' },
];
const TOOL_VIEWS = ['tools', ...TOOL_ITEMS.map((t) => t.view)];

export function Nav({ view, navigate }: NavProps) {
  const { user, isAdmin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const onToolsPage = TOOL_VIEWS.includes(view);
  const [toolsOpen, setToolsOpen] = useState(onToolsPage);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(min-width: 960px)');
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  // Escape closes; Tab is trapped inside the drawer while it is open
  useEffect(() => {
    if (!open || desktop) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !drawerRef.current) return;
      const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !drawerRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, desktop]);

  // Body scroll lock while open; move focus into the drawer and back out
  useEffect(() => {
    if (open && !desktop) {
      wasOpen.current = true;
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      closeBtnRef.current?.focus();
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open, desktop]);

  // Keep the Tools submenu discoverable: expand it whenever the drawer opens
  // while a tools page is the current view
  useEffect(() => {
    if ((open || desktop) && onToolsPage) setToolsOpen(true);
  }, [open, desktop, onToolsPage]);

  const go = (target: string) => {
    navigate(target);
    setOpen(false);
  };

  // Use the actual HTML entities from original: ☼ (9788) for dark, ☾ (9790) for light
  const themeIconHtml = theme === 'light' ? '&#9790;' : '&#9788;';

  const songsActive = view === 'browse' ? ' active' : '';
  const setlistActive = ['setlists', 'setlist-edit', 'setlist-play', 'public-setlists'].includes(view) ? ' active' : '';

  // Tools row + disclosure toggle are sibling buttons (never nested interactive
  // elements); the toggle controls the submenu of direct tool links.
  const toolsGroup = (
    <div className="nav-drawer-group">
      <div className="nav-drawer-group-row">
        <button
          className={`nav-drawer-item nav-drawer-group-parent${onToolsPage ? ' active' : ''}`}
          onClick={() => go('tools')}
        >
          Tools
        </button>
        <button
          className="nav-drawer-item nav-drawer-group-toggle"
          aria-expanded={toolsOpen}
          aria-controls="nav-tools-submenu"
          aria-label={toolsOpen ? 'Collapse Tools submenu' : 'Expand Tools submenu'}
          onClick={() => setToolsOpen((o) => !o)}
        >
          <span className="nav-drawer-chevron" aria-hidden="true">
            &#9656;
          </span>
        </button>
      </div>
      <div id="nav-tools-submenu" className="nav-drawer-submenu" hidden={!toolsOpen}>
        {TOOL_ITEMS.map((t) => (
          <button
            key={t.view}
            className={`nav-drawer-item nav-drawer-subitem${view === t.view ? ' active' : ''}`}
            onClick={() => go(t.view)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <nav id="nav">
      <div className="nav-brand" onClick={() => navigate('browse')}>
        <span className="nav-logo" dangerouslySetInnerHTML={{ __html: logoSvg }} /> WorshipSessions
      </div>
      <button
        ref={triggerRef}
        className="nav-btn nav-icon nav-drawer-trigger"
        aria-expanded={open}
        aria-controls="nav-drawer"
        aria-label="Open navigation menu"
        title="Menu"
        onClick={() => setOpen(true)}
      >
        &#9776;
      </button>
      {/* Portaled to <body>: #nav's backdrop-filter makes it the containing
          block for fixed descendants, which clips the drawer to the nav bar. */}
      {createPortal(
        <>
          <div className={`nav-drawer-backdrop${open ? ' open' : ''}`} onClick={close} aria-hidden="true" />
          <div
            ref={drawerRef}
            id="nav-drawer"
            className={`nav-drawer${open || desktop ? ' open' : ''}`}
            role={desktop ? 'navigation' : 'dialog'}
            aria-modal={desktop ? undefined : 'true'}
            aria-label="Navigation menu"
            inert={!desktop && !open}
          >
            <div className="nav-drawer-header">
              <span className="nav-drawer-title">Menu</span>
              <button
                ref={closeBtnRef}
                className="nav-btn nav-icon nav-drawer-close"
                aria-label="Close navigation menu"
                onClick={close}
              >
                &times;
              </button>
            </div>
            <div className="nav-drawer-items">
              <section className="nav-drawer-section" aria-labelledby="nav-library-label">
                <div id="nav-library-label" className="nav-drawer-section-label">
                  Library
                </div>
                <button className={`nav-drawer-item${songsActive}`} onClick={() => go('browse')}>
                  Songs
                </button>
                <button
                  className={`nav-drawer-item${setlistActive}`}
                  onClick={() => go(user ? 'setlists' : 'public-setlists')}
                >
                  Setlists
                </button>
                {user && (
                  <button
                    className={`nav-drawer-item${view === 'my-songs' ? ' active' : ''}`}
                    onClick={() => go('my-songs')}
                  >
                    My Songs
                  </button>
                )}
              </section>

              <section className="nav-drawer-section" aria-labelledby="nav-tools-label">
                <div id="nav-tools-label" className="nav-drawer-section-label">
                  Music tools
                </div>
                {toolsGroup}
              </section>

              <section className="nav-drawer-section nav-drawer-account" aria-labelledby="nav-account-label">
                <div id="nav-account-label" className="nav-drawer-section-label">
                  Account
                </div>
                {!user ? (
                  <button
                    className={`nav-drawer-item nav-signin${view === 'auth' ? ' active' : ''}`}
                    onClick={() => go('auth')}
                  >
                    Sign in
                  </button>
                ) : (
                  <>
                    {isAdmin && (
                      <button
                        className={`nav-drawer-item${view === 'admin' ? ' active' : ''}`}
                        onClick={() => go('admin')}
                      >
                        Admin
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        className={`nav-drawer-item${view === 'settings' ? ' active' : ''}`}
                        onClick={() => go('settings')}
                      >
                        Settings
                      </button>
                    )}
                    <button
                      className="nav-drawer-item"
                      onClick={() => {
                        logout();
                        go('browse');
                      }}
                    >
                      Sign out
                    </button>
                  </>
                )}
              </section>
            </div>
            <div className="nav-drawer-footer">
              <button className="nav-drawer-item nav-drawer-theme" onClick={toggleTheme} title="Toggle theme">
                <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: themeIconHtml }} /> Toggle theme
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </nav>
  );
}
