import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { useChordRenderer } from '../hooks/useChordRenderer';
import { useFontScale } from '../hooks/useFontScale';
import { useTwoCol } from '../hooks/useTwoCol';
import { useChartTone } from '../hooks/useChartTone';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useSongReadingPreferences } from '../hooks/useSongReadingPreferences';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { ChordSheet } from '../components/ChordSheet';
import { Toolbar } from '../components/Toolbar';
import { Loading } from '../components/Loading';
import { AddToSetlistModal } from '../components/AddToSetlistModal';
import { MusicianTools } from '../components/MusicianTools';
import { renderChordPro, songHasKey, autoFit, isSectionLabel } from '../lib/chords';
import { extractChordNames, simplifyChordPro } from '../lib/musician-tools';
import { languageName } from '../lib/languages';
import { getTransposeDelta } from '../lib/keys';
import type { Song, SongVersion, Correction } from '../types';

function extractRoadmap(content: string): string[] {
  const seen = new Set<string>();
  return content.split('\n').reduce<string[]>((sections, rawLine) => {
    const line = rawLine.trim().replace(/^\[|\]$/g, '');
    if (line && isSectionLabel(line) && !seen.has(line.toLowerCase())) {
      seen.add(line.toLowerCase());
      sections.push(line);
    }
    return sections;
  }, []);
}

interface SongViewProps {
  songId: number;
  navigate: (view: string, params?: Record<string, string>) => void;
}

export function SongView({ songId, navigate }: SongViewProps) {
  const apiCall = useApi();
  const { user } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [song, setSong] = useState<Song | null>(null);
  const [versions, setVersions] = useState<SongVersion[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [addToSetlistOpen, setAddToSetlistOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setSong(null);
    apiCall<Song>('GET', `/api/songs/${songId}`)
      .then((data) => {
        setSong(data);
        location.hash = `#song/${songId}`;
      })
      .catch((e) => {
        toast(e.message, 'error');
        navigate(user ? 'my-songs' : 'browse');
      });
  }, [songId, apiCall, navigate, toast, user]);

  useEffect(() => {
    if (!song) return;
    apiCall<SongVersion[]>('GET', `/api/songs/${songId}/versions`)
      .then((v) => {
        if (v.length > 1) setVersions(v);
      })
      .catch(() => {});
    if (user && user.username === song.username) {
      apiCall<Correction[]>('GET', `/api/songs/${songId}/corrections`)
        .then(setCorrections)
        .catch(() => {});
    }
  }, [song, songId, apiCall, user]);

  const content = song?.content || '';
  const chord = useChordRenderer(content);
  const fontScale = useFontScale();
  const twoColState = useTwoCol();
  const chartTone = useChartTone();
  const preferenceId = song ? song.parent_id || song.id : null;
  const {
    preferences,
    update: updateReadingPreferences,
    reset: resetReadingPreferences,
  } = useSongReadingPreferences(preferenceId, {
    fontSize: fontScale.fontSize,
    twoCol: twoColState.twoCol,
    chartTone: chartTone.tone,
  });

  const [autoFitResult, setAutoFitResult] = useState<{ fontSize: number; twoCol: boolean } | null>(null);
  const autoFitTimer = useRef<number | null>(null);
  const chartScrollRef = useRef<HTMLElement>(null);
  const [controlsOpen, setControlsOpen] = useState(() => {
    try {
      return localStorage.getItem('worshipsessions-song-controls-open') === 'true';
    } catch {
      return false;
    }
  });
  const toggleControls = useCallback(() => {
    setControlsOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem('worshipsessions-song-controls-open', String(next));
      } catch {
        // Controls remain usable when storage is unavailable.
      }
      return next;
    });
  }, []);
  const autoScroll = useAutoScroll(true, chartScrollRef, 1.5);

  const scheduleAutoFit = useCallback(() => {
    if (autoFitTimer.current != null) window.clearTimeout(autoFitTimer.current);
    autoFitTimer.current = window.setTimeout(() => {
      setAutoFitResult(autoFit());
      autoFitTimer.current = null;
    }, 100);
  }, []);

  const cancelAutoFit = useCallback(() => {
    if (autoFitTimer.current != null) window.clearTimeout(autoFitTimer.current);
    autoFitTimer.current = null;
    setAutoFitResult(null);
  }, []);

  const handleAutoFit = useCallback(() => {
    if (preferences.autoFit) {
      updateReadingPreferences({ autoFit: false });
      cancelAutoFit();
      return;
    }
    updateReadingPreferences({ autoFit: true });
    scheduleAutoFit();
  }, [cancelAutoFit, preferences.autoFit, scheduleAutoFit, updateReadingPreferences]);

  const { setTranspose, setNashville } = chord;

  useEffect(() => {
    setTranspose(preferences.transpose);
    setNashville(preferences.nashville);
  }, [preferenceId, preferences.transpose, preferences.nashville, setTranspose, setNashville]);

  useEffect(() => {
    cancelAutoFit();
  }, [preferenceId, cancelAutoFit]);

  useEffect(() => {
    if (!preferences.autoFit) {
      cancelAutoFit();
      return;
    }
    scheduleAutoFit();
    window.addEventListener('resize', scheduleAutoFit);
    return () => {
      window.removeEventListener('resize', scheduleAutoFit);
      if (autoFitTimer.current != null) window.clearTimeout(autoFitTimer.current);
      autoFitTimer.current = null;
    };
  }, [content, chord.transpose, chord.nashville, preferences.autoFit, preferenceId, scheduleAutoFit, cancelAutoFit]);

  const displayContent = useMemo(
    () => (preferences.simplified ? simplifyChordPro(content) : content),
    [content, preferences.simplified],
  );
  const renderedHtml = useMemo(
    () => renderChordPro(displayContent, chord.transpose, chord.nashville),
    [displayContent, chord.transpose, chord.nashville],
  );

  const roadmap = useMemo(() => extractRoadmap(content), [content]);
  const songChords = useMemo(() => extractChordNames(displayContent), [displayContent]);

  const jumpToSection = (section: string) => {
    const wanted = section.toLowerCase();
    const target = Array.from(document.querySelectorAll('.chord-sheet .label, .chord-sheet .section-label')).find(
      (node) => node.textContent?.trim().replace(/:$/, '').toLowerCase() === wanted,
    );
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const shortcuts = useMemo(
    () => ({
      ArrowUp: (e: KeyboardEvent) => {
        e.preventDefault();
        const transpose = chord.transpose + 1;
        chord.doTranspose(1);
        updateReadingPreferences({ transpose, nashville: false });
      },
      ArrowDown: (e: KeyboardEvent) => {
        e.preventDefault();
        const transpose = chord.transpose - 1;
        chord.doTranspose(-1);
        updateReadingPreferences({ transpose, nashville: false });
      },
      '+': (e: KeyboardEvent) => {
        e.preventDefault();
        const transpose = chord.transpose + 1;
        chord.doTranspose(1);
        updateReadingPreferences({ transpose, nashville: false });
      },
      '-': (e: KeyboardEvent) => {
        e.preventDefault();
        const transpose = chord.transpose - 1;
        chord.doTranspose(-1);
        updateReadingPreferences({ transpose, nashville: false });
      },
      '0': () => {
        chord.resetTranspose();
        updateReadingPreferences({ transpose: 0 });
      },
      n: () => {
        const nashville = !chord.nashville;
        chord.toggleNashville(nashville);
        updateReadingPreferences({ nashville });
      },
      N: () => {
        const nashville = !chord.nashville;
        chord.toggleNashville(nashville);
        updateReadingPreferences({ nashville });
      },
    }),
    [chord, updateReadingPreferences],
  );

  useKeyboardShortcuts(shortcuts, !!song);

  const isOwner = user && song && user.username === song.username;

  const restoreVersion = async () => {
    if (!song || !isOwner || song.id === (song.parent_id || song.id)) return;
    if (!confirm('Restore this version as the main song chart?')) return;
    try {
      const rootId = song.parent_id || song.id;
      await apiCall('POST', `/api/songs/${rootId}/restore-version`, { version_id: song.id });
      toast('Version restored', 'success');
      navigate('song-view', { id: String(rootId) });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const handleExportPdf = async () => {
    if (!song || exporting) return;
    setExporting(true);
    try {
      const { exportSongPdf } = await import('../lib/pdf-export');
      const missing = await exportSongPdf(song, {
        transpose: chord.transpose,
        nashville: chord.nashville,
        fontSize: preferences.fontSize,
      });
      if (missing.length) {
        toast(`PDF exported, but these characters may be missing: ${missing.slice(0, 8).join(' ')}`, 'error');
      } else {
        toast('PDF exported', 'success');
      }
    } catch (e) {
      toast((e as Error).message || 'PDF export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  const approveCorrection = async (id: number) => {
    if (!confirm('Apply this correction? The original song content will be updated.')) return;
    try {
      await apiCall('PUT', `/api/corrections/${id}/approve`);
      toast('Correction approved', 'success');
      setSong(null);
      const data = await apiCall<Song>('GET', `/api/songs/${songId}`);
      setSong(data);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const rejectCorrection = async (id: number) => {
    if (!confirm('Reject and delete this correction?')) return;
    try {
      await apiCall('DELETE', `/api/corrections/${id}`);
      toast('Correction rejected', 'success');
      setCorrections((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (!song) return <Loading />;

  return (
    <div lang={song.language || undefined}>
      <div className="song-view-header">
        <div className="song-view-nav">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              location.hash = '';
              navigate(user ? 'my-songs' : 'browse');
            }}
          >
            &#8592; {t('songView.back')}
          </button>
          <div className="song-view-actions" role="group" aria-label="Song actions">
            {isOwner && (
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('song-edit', { id: String(song.id) })}>
                &#9998; {t('songView.edit')}
              </button>
            )}
            {user && !isOwner && song.visibility !== 'private' && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('song-edit', { id: String(song.id) })}>
                  &#43; Create Version
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => navigate('correction', { id: String(song.id) })}
                >
                  &#9998; Correction
                </button>
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setAddToSetlistOpen(true)}>
              &#43; {t('songView.addToSetlist')}
            </button>
          </div>
        </div>
        <div className="song-view-identity song-view-identity-clean">
          <div className="song-view-heading">
            <div className="song-view-eyebrow">Song chart</div>
            <h1 className="song-view-title">{song.title}</h1>
            {song.artist && <div className="song-view-artist">{song.artist}</div>}
          </div>
          <div className="song-view-performance-summary" aria-label="Performance details">
            <div className="song-view-key" aria-label={`Current key ${chord.currentKey || 'unknown'}`}>
              <span className="song-view-key-label">Key</span>
              <span className="song-view-key-value">{chord.currentKey || '?'}</span>
            </div>
            {song.bpm && <span className="song-view-stat song-view-tempo">{song.bpm} BPM</span>}
          </div>
        </div>
        <div className="song-view-meta">
          {!isOwner && song.username && <span className="song-view-by">@{song.username}</span>}
          {song.language && (
            <span className="song-view-stat" title={languageName(song.language)}>
              {languageName(song.language)}
            </span>
          )}
          {isOwner && song.visibility === 'private' && <span className="song-view-stat">&#128274; Private</span>}
          {versions.length > 1 && (
            <div className="version-selector-container">
              <span className="version-selector-label">Version</span>
              <select
                className="version-select-compact"
                value={songId}
                onChange={(e) => navigate('song-view', { id: e.target.value })}
              >
                {versions.map((v, idx) => (
                  <option key={v.id} value={v.id}>
                    {idx + 1} (@{v.username}) {v.youtube_url ? '▶' : ''}
                  </option>
                ))}
              </select>
              {isOwner && song.id !== (song.parent_id || song.id) && (
                <button className="btn btn-ghost btn-sm" type="button" onClick={restoreVersion}>
                  Restore this version
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        className={`song-controls-toggle${controlsOpen ? ' active' : ''}`}
        aria-expanded={controlsOpen}
        aria-controls="song-controls-panel"
        aria-label={controlsOpen ? 'Hide chart controls' : 'Show chart controls'}
        onClick={toggleControls}
      >
        {controlsOpen ? '⌃ Hide controls' : '⌄ Controls'}
      </button>
      {controlsOpen && (
        <div id="song-controls-panel" className="song-controls-panel">
          <div className="ug-reader-tabs" aria-label="Chart display modes">
            <button
              type="button"
              className={!preferences.nashville ? 'active' : ''}
              aria-pressed={!preferences.nashville}
              onClick={() => {
                chord.toggleNashville(false);
                updateReadingPreferences({ nashville: false });
              }}
            >
              Chords
            </button>
            <button
              type="button"
              className={preferences.nashville ? 'active' : ''}
              aria-pressed={preferences.nashville}
              onClick={() => {
                const nashville = !preferences.nashville;
                chord.toggleNashville(nashville);
                updateReadingPreferences({ nashville });
              }}
            >
              Numbers
            </button>
          </div>
          <Toolbar
            currentKey={chord.currentKey}
            nashville={preferences.nashville}
            nashvilleDisabled={!songHasKey(content, chord.transpose)}
            onNashvilleChange={(nashville) => updateReadingPreferences({ nashville })}
            twoCol={preferences.twoCol}
            onTwoColToggle={() => {
              cancelAutoFit();
              updateReadingPreferences({ twoCol: !preferences.twoCol, autoFit: false });
            }}
            fontSize={preferences.fontSize}
            onFontChange={(delta) => {
              cancelAutoFit();
              updateReadingPreferences({ fontSize: preferences.fontSize + delta, autoFit: false });
            }}
            onReset={() => {
              chord.setTranspose(0);
              chord.setNashville(false);
              cancelAutoFit();
              resetReadingPreferences();
            }}
            onPickKey={(key) => {
              const delta = getTransposeDelta(chord.currentKey, key);
              chord.pickKey(key);
              updateReadingPreferences({ transpose: chord.transpose + delta, nashville: false });
            }}
            onAutoFit={handleAutoFit}
            autoFitActive={preferences.autoFit}
            onExportPdf={handleExportPdf}
            renderKey={songId}
            compactKey
            chartTone={preferences.chartTone}
            onChartToneChange={() =>
              updateReadingPreferences({ chartTone: preferences.chartTone === 'paper' ? 'dark' : 'paper' })
            }
            resetDisabled={
              preferences.transpose === 0 &&
              !preferences.nashville &&
              preferences.fontSize === fontScale.fontSize &&
              preferences.twoCol === twoColState.twoCol &&
              preferences.chartTone === chartTone.tone &&
              !preferences.autoFit
            }
          />
        </div>
      )}

      <MusicianTools
        chords={songChords}
        bpm={song.bpm}
        simplified={preferences.simplified}
        onSimplifiedChange={(simplified) => updateReadingPreferences({ simplified })}
      />

      {roadmap.length > 0 && (
        <nav className="song-roadmap" aria-label="Song sections">
          {roadmap.map((section) => (
            <button key={section} className="song-roadmap-item" type="button" onClick={() => jumpToSection(section)}>
              {section}
            </button>
          ))}
        </nav>
      )}

      <div className="song-autoscroll" role="group" aria-label="Song auto-scroll">
        <button
          type="button"
          className={`song-autoscroll-toggle${autoScroll.running ? ' active' : ''}`}
          onClick={autoScroll.toggle}
          aria-label={autoScroll.running ? 'Pause song auto-scroll' : 'Start song auto-scroll'}
          aria-pressed={autoScroll.running}
        >
          <span aria-hidden="true">{autoScroll.running ? 'Ⅱ' : '▶'}</span>
          {autoScroll.running ? 'Pause' : 'Auto-scroll'}
        </button>
        <div className="song-autoscroll-speed" role="group" aria-label="Auto-scroll speed">
          <button
            type="button"
            onClick={() => autoScroll.setSpeed(autoScroll.speed - 0.1)}
            disabled={autoScroll.speed <= 0.1}
            aria-label="Decrease auto-scroll speed"
          >
            −
          </button>
          <span aria-live="polite">{autoScroll.speed.toFixed(1)}×</span>
          <button
            type="button"
            onClick={() => autoScroll.setSpeed(autoScroll.speed + 0.1)}
            disabled={autoScroll.speed >= 1.5}
            aria-label="Increase auto-scroll speed"
          >
            +
          </button>
        </div>
      </div>

      <section className="chart-reading-surface" aria-label="Chord chart" ref={chartScrollRef}>
        <ChordSheet
          html={renderedHtml}
          twoCol={autoFitResult?.twoCol ?? preferences.twoCol}
          fontSize={autoFitResult?.fontSize ?? preferences.fontSize}
          autoFit={preferences.autoFit}
          tone={preferences.chartTone}
        />
      </section>

      {(song.tags || song.youtube_url) && (
        <div className="song-view-meta song-view-meta-bottom">
          {song.tags &&
            song.tags.split(',').map((tag) => (
              <span key={tag} className="badge badge-tag">
                {tag}
              </span>
            ))}
          {song.youtube_url && (
            <a href={song.youtube_url} target="_blank" rel="noopener" className="yt-link">
              &#9654; YouTube
            </a>
          )}
        </div>
      )}

      {/* Corrections section */}
      {isOwner && corrections.length > 0 && (
        <div className="corrections-section">
          <h3 className="admin-section-title">Pending Corrections ({corrections.length})</h3>
          {corrections.map((c) => (
            <div key={c.id} className="correction-card">
              <div className="correction-card-header">
                <span>
                  @{c.username} &middot; {new Date(c.created_at).toLocaleDateString()}
                </span>
                <div className="correction-actions">
                  <button className="btn btn-sm" onClick={() => approveCorrection(c.id)}>
                    Approve
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => rejectCorrection(c.id)}>
                    Reject
                  </button>
                </div>
              </div>
              <div
                className="correction-preview"
                dangerouslySetInnerHTML={{ __html: renderChordPro(c.content, 0, false) }}
              />
            </div>
          ))}
        </div>
      )}

      <AddToSetlistModal
        isOpen={addToSetlistOpen}
        onClose={() => setAddToSetlistOpen(false)}
        songId={songId}
        songTitle={song?.title || ''}
        songArtist={song?.artist || ''}
        songVisibility={song?.visibility}
        transpose={chord.transpose}
        nashville={chord.nashville}
      />
    </div>
  );
}
