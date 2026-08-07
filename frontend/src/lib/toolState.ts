import { useEffect, useState } from 'react';
import { getSessionItem, removeSessionItem, setSessionItem } from './storage';

// Cross-tool handoff: carries a pasted chart and/or working key from one tool
// page to another via sessionStorage, so deep-link hashes stay small and safe.

const HANDOFF_KEY = 'cv_tool_handoff';

export interface ToolPayload {
  text?: string;
  key?: string;
}

export function stashToolPayload(payload: ToolPayload): void {
  setSessionItem(HANDOFF_KEY, JSON.stringify(payload));
}

export function peekToolPayload(): ToolPayload | null {
  const raw = getSessionItem(HANDOFF_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ToolPayload) : null;
  } catch {
    return null;
  }
}

export function clearToolPayload(): void {
  removeSessionItem(HANDOFF_KEY);
}

// Reads the pending payload once on mount, then clears it so it does not leak
// into unrelated visits later in the session.
export function useToolHandoff(): ToolPayload | null {
  const [payload] = useState(() => peekToolPayload());
  useEffect(() => {
    clearToolPayload();
  }, []);
  return payload;
}
