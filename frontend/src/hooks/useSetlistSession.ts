import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import { useApi } from './useApi';
import type { SetlistEntry } from '../types';

export type SessionMode = 'solo' | 'lead' | 'follow';

export interface SessionState {
  active: boolean;
  version: number;
  host?: string;
  entry_id?: number;
  index?: number;
  is_owner?: boolean;
}

const PING_MS = 30_000;
const RETRY_MS = 4_000;

interface Options {
  setlistId: number | string;
  enabled: boolean; // false for local setlists
  isOwner: boolean;
  entries: SetlistEntry[];
  index: number;
  goTo: (index: number) => void;
}

/**
 * "Now playing" sync. The owner leads: each navigation is pushed to the server
 * and re-sent every 30s so followers can tell the leader is still there.
 * Followers long-poll and jump to the leader's song. Following never writes, and
 * a follower can step away to look at another song by switching back to solo.
 */
export function useSetlistSession({ setlistId, enabled, isOwner, entries, index, goTo }: Options) {
  const apiCall = useApi();
  const [mode, setModeState] = useState<SessionMode>('solo');
  const [remote, setRemote] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const goToRef = useRef(goTo);
  const entriesRef = useRef(entries);
  // Refs are updated in an effect, not during render, so the long-poll loop
  // always reads the latest values without restarting.
  useEffect(() => {
    goToRef.current = goTo;
    entriesRef.current = entries;
  }, [goTo, entries]);

  const path = `/api/setlists/${setlistId}/session`;
  const entryId = entries[index]?.entry_id;

  const setMode = useCallback((next: SessionMode) => {
    setError(null);
    setModeState(next);
  }, []);

  // Leader: push on every navigation, then ping while idle.
  useEffect(() => {
    if (!enabled || mode !== 'lead' || entryId === undefined) return;
    let cancelled = false;
    const push = () =>
      apiCall<SessionState>('PUT', path, { entry_id: entryId, index }).catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not share your position.');
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) setModeState('solo');
      });
    void push();
    const timer = setInterval(push, PING_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, mode, entryId, index, path, apiCall]);

  // Leaving lead mode (or the player) ends the session for followers.
  useEffect(() => {
    if (!enabled || mode !== 'lead') return;
    return () => {
      void apiCall('DELETE', path).catch(() => {});
    };
  }, [enabled, mode, path, apiCall]);

  // Follower: long-poll for the leader's position.
  useEffect(() => {
    if (!enabled || mode !== 'follow') {
      setRemote(null);
      return;
    }
    let cancelled = false;
    let since: number | undefined;
    const loop = async () => {
      while (!cancelled) {
        try {
          const query = since === undefined ? '' : `?since=${since}`;
          const state = await apiCall<SessionState>('GET', `${path}${query}`);
          if (cancelled) return;
          since = state.version;
          setRemote(state);
          setError(null);
          if (state.active && typeof state.index === 'number') {
            const target = entriesRef.current[state.index];
            if (target && target.entry_id === state.entry_id) goToRef.current(state.index);
          }
        } catch (err) {
          if (cancelled) return;
          if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
            setError('This setlist is not available to follow.');
            setModeState('solo');
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
        }
      }
    };
    void loop();
    return () => {
      cancelled = true;
    };
  }, [enabled, mode, path, apiCall]);

  return {
    mode,
    setMode,
    canLead: enabled && isOwner,
    canFollow: enabled,
    remote: mode === 'follow' ? remote : null,
    leaderPresent: mode === 'follow' ? !!remote?.active : false,
    error,
  };
}
