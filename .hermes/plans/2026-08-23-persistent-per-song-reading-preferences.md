# Persistent Per-Song Reading Preferences — Implementation Plan

**Date:** 2026-08-23
**Repository:** `C:\Users\jayel\WorshipSessions`
**Current base:** `unified-chart-format` at `88736bc`
**Status:** Plan only — no product code changes

## Goal

Make each song reopen in the reader exactly as the user last prepared it on that browser, without changing the song chart, publishing preferences to other users, or interfering with setlist-specific overrides.

Persist these Song View choices per song:

- transposition / selected performance key
- Nashville-number mode
- font-size adjustment
- one-column versus two-column mode
- light versus dark chart tone
- auto-fit enabled state

## Product contract

1. Preferences are **local to the current browser/device**. They are not song metadata and are never written to the server.
2. Preferences are keyed by the song's canonical version family: `parent_id || id`. All versions of the same song share the same reading setup.
3. A stored per-song value overrides the existing global/default reader value only in `SongView`.
4. Setlist playback remains unchanged. Its setlist and entry overrides continue to take precedence and use the existing code path.
5. Reset returns all Song View choices to their defaults and removes that song's stored preference record.
6. Corrupt, partial, or old local-storage data must fail safely and fall back to defaults.
7. Auto-fit is persisted as an **enabled preference**, not as stale calculated font/column values. When enabled, fit is recalculated for the current screen after the chart renders and on relevant viewport changes.
8. The preference is updated only from explicit reader actions; simply opening a song must not overwrite stored values.

## Non-goals

- Account/cloud synchronization
- Database migrations or API changes
- Changing setlist preference behavior
- Persisting fullscreen or wake-lock handles
- Editing song content or visibility
- Redesigning the toolbar
- Migrating the GitHub repository during this feature

## Storage design

### `frontend/src/lib/storage.ts`

Add a versioned storage key, for example:

```ts
cv_song_reading_preferences_v1;
```

Define a narrow type:

```ts
type SongReadingPreferences = {
  transpose?: number;
  nashville?: boolean;
  fontSize?: number;
  twoCol?: boolean;
  chartTone?: 'paper' | 'dark';
  autoFit?: boolean;
};
```

Store a map keyed by canonical song ID:

```json
{
  "42": {
    "transpose": 2,
    "nashville": false,
    "fontSize": 1,
    "twoCol": true,
    "chartTone": "dark",
    "autoFit": false
  }
}
```

Add:

- `getSongReadingPreferences(songId)`
- `saveSongReadingPreferences(songId, patch)`
- `clearSongReadingPreferences(songId)`

Validation rules:

- transpose: finite integer, clamped to a musically equivalent practical range (for example `-11..11`)
- font size: use `clampFontSize`
- booleans: accept only actual booleans
- chart tone: accept only `paper` or `dark`
- malformed JSON: return `{}` without throwing
- saving one song must preserve all other song records

## Hook design

### New `frontend/src/hooks/useSongReadingPreferences.ts`

Create one coordinator hook rather than adding storage responsibilities independently to every existing generic hook.

Inputs:

- canonical song ID or `null`
- current fallback defaults for font, columns, and tone
- chart content or original key where needed for transpose validation

Responsibilities:

- load the canonical song's preferences when the song/version family changes
- expose controlled values and mutation functions for Song View
- persist explicit mutations
- enforce Nashville/transpose consistency: enabling Nashville resets transpose to `0`, matching current behavior
- clear the current song's record and return to global/layout defaults
- avoid writing during initial hydration

The existing generic hooks should remain usable by Setlist Play and other screens. If narrow setter support is missing (for example chart tone), add it without changing existing behavior.

## Song View integration

### `frontend/src/views/SongView.tsx`

After the song loads:

1. Calculate `preferenceId = song.parent_id || song.id`.
2. Hydrate the per-song preferences.
3. Pass the persisted values into rendering and Toolbar controls.
4. Replace direct Toolbar mutations with coordinator callbacks that both update UI state and persist the explicit choice.
5. Reset should:
   - transpose to original key
   - disable Nashville
   - restore default font size
   - restore responsive column default
   - restore global chart tone default
   - disable auto-fit
   - remove the per-song preference record
6. Switching to another version of the same song should keep the setup.
7. Switching to an unrelated song should load that song's setup with no visible leakage from the previous song.

### Auto-fit behavior

Refactor the existing one-time `handleAutoFit` calculation into a reusable callback.

- Toggling FIT on calculates and applies fit for the current viewport.
- Toggling FIT off restores the stored manual font/column choices for that song.
- While enabled, recalculate after the chart/screen dimensions change, using a debounced resize observer or window resize listener.
- Manual font or column actions disable auto-fit before applying the manual choice, so user intent is unambiguous.

## Test-first implementation sequence

### Phase 1 — Storage contract (RED → GREEN)

Add `frontend/src/lib/__tests__/storage.song-reading-preferences.test.ts`.

Tests:

1. returns `{}` when no record exists
2. saves and retrieves a complete preference record
3. merges a partial patch without deleting existing fields
4. preserves preferences for other songs
5. isolates unrelated song IDs
6. rejects malformed JSON and invalid field types safely
7. clamps font/transpose values
8. clears only the selected song

Run focused test and confirm it fails before implementing storage functions.

### Phase 2 — Coordinator hook (RED → GREEN)

Add `frontend/src/hooks/__tests__/useSongReadingPreferences.test.ts`.

Tests:

1. hydrates stored values for the selected canonical ID
2. falls back to supplied defaults when absent
3. persists explicit changes
4. does not save merely because it hydrated
5. reloads cleanly when canonical song ID changes
6. shares preferences across version IDs using the caller-provided canonical ID
7. enabling Nashville resets transposition
8. reset clears storage and restores defaults

### Phase 3 — Song View behavior (RED → GREEN)

Extend `frontend/src/views/__tests__/SongView.test.tsx` using stable Toolbar mocks that expose actions.

Tests:

1. uses `parent_id || id` as the preference key
2. restores transposition, Nashville, font, columns, tone, and auto-fit
3. explicit Toolbar changes persist
4. switching songs does not leak prior preferences
5. switching versions preserves preferences
6. reset clears the current song and updates all controls
7. manual font/column changes disable auto-fit

### Phase 4 — Auto-fit lifecycle (RED → GREEN)

Add focused tests for:

1. persisted auto-fit triggers a fresh calculation, not restoration of stale calculated dimensions
2. resize while enabled recalculates
3. resize while disabled does nothing
4. listener/observer cleanup on unmount or song change

## Verification gates

Run in this order:

1. Focused new storage tests
2. Focused hook tests
3. Focused Song View tests
4. Full frontend tests: `npm test`
5. Frontend lint: `npm run lint`
6. Frontend build: `npm run build`
7. Frontend format check: `npm run format:check`
8. Root/backend tests and lint because this repository's release gate includes both
9. `git diff --check`
10. Independent review of the complete diff
11. Authenticated browser validation on at least two different songs and two versions of one song
12. Refresh/reopen validation to prove persistence
13. Mobile-width validation for responsive two-column defaults and auto-fit

## Manual acceptance scenarios

### Scenario A — Song-specific recall

- Open Song A.
- Set key, font, two columns, dark chart, and FIT.
- Refresh; all choices return.
- Open Song B; Song A's setup does not appear.
- Return to Song A; its setup returns.

### Scenario B — Version family

- Open a non-root version of Song A.
- Change the reading setup.
- Navigate to another version of Song A.
- The setup remains because both use the same canonical ID.

### Scenario C — Reset

- With several non-default choices active, press Reset.
- All six choices return to defaults.
- Refresh; defaults remain.
- Other songs' preferences are untouched.

### Scenario D — Responsive auto-fit

- Enable FIT on desktop and resize to mobile width.
- The chart recalculates without stale desktop dimensions.
- Change font manually; FIT turns off and the manual size persists.

## Branch and delivery strategy

- Do not modify the already-pushed `unified-chart-format` commit.
- Create a new branch from it, suggested name: `feature/per-song-reading-preferences`.
- Keep this feature in one focused commit only after all verification and independent review pass.
- Do not commit or push while review is pending or failing.
- The later private-repository migration remains independent; this branch and its full history can be migrated with the existing verified Git bundle.

## Risks and mitigations

- **Preference leakage between songs:** key all state by canonical ID and test route changes.
- **Setlist regressions:** do not retrofit the new hook into Setlist Play; run its full tests.
- **Hydration overwrites storage:** separate initialization from explicit user mutations.
- **Auto-fit stores stale derived values:** persist only enabled state and recalculate.
- **Responsive two-column behavior becomes sticky unintentionally:** reset to responsive default and let explicit per-song choice override it.
- **LocalStorage quota/corruption:** small records, guarded parse/write, safe defaults.
- **Version mismatch:** version the storage key and validate every field.

## Definition of done

The feature is complete only when:

- all six listed preferences survive refresh per canonical song
- unrelated songs remain isolated
- versions share one preference profile
- reset removes only the current song's profile
- setlist behavior remains unchanged
- auto-fit recalculates safely across viewport changes
- all automated gates pass
- independent review finds no blockers
- authenticated desktop and mobile-width manual checks pass
