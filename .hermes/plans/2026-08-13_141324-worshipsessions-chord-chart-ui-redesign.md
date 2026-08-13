# WorshipSessions Chord-Chart UI Redesign Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Refocus WorshipSessions as a simple, highly readable chord-chart application for worship teams, with setlists as the supporting workflow and an expandable side tools area for future music utilities.

**Architecture:** Preserve the existing React/TypeScript frontend, Express/SQLite backend, routes, database, authentication, imports, setlists, Live Mode and tool implementations. Replace the generic dark-SaaS visual shell incrementally with a chart-first information architecture: responsive desktop navigation, mobile drawer, clearer library/setlist hierarchy, and a dedicated chart reading surface. No repository replacement and no broad backend rewrite.

**Tech Stack:** React + TypeScript + Vite, existing CSS token files, Express, SQLite, Vitest, Node test runner, ESLint, TypeScript build, Brave headless screenshots for visual verification.

---

## Product contract

WorshipSessions is **not** being redesigned into a full church projection suite. Its core job is:

1. Find and read chord charts quickly.
2. Help a worship team prepare and use setlists.
3. Provide a growing, organized collection of music tools.

The chart is the primary surface. Tools are secondary navigation. Live Mode is a performance state, not a separate product identity.

### Non-goals

- Do not replace WorshipSessions with FreeShow, Quelea or another GitHub repository.
- Do not add projector/media/presentation management in this redesign.
- Do not change song content, import semantics, chord alignment, ownership, privacy or database relationships.
- Do not redesign all screens at once without preserving a usable intermediate state.
- Do not introduce a UI framework solely for cosmetics.
- Do not use stock imagery or decorative religious clichés as the primary identity.

---

## Design direction

### Visual language: “Digital chord book”

- Deep blue-black ink background instead of flat pure black.
- Warm off-white chart surface in normal reading mode.
- Muted amber/gold for chords, active song, selected key and primary action.
- Sage/teal for saved/ready states; red only for destructive/error states.
- Humanist sans-serif for interface copy.
- Highly legible tabular or semi-monospace treatment for chords, keys, BPM and numeric tool outputs.
- Structured chart panels and borders; reduce generic oversized shadows and indiscriminate rounded cards.
- A simple original WorshipSessions mark based on a chart spine/chord slash, not a generic music-note glyph.

### Information architecture

Desktop/tablet:

- Brand/header.
- Library: Songs, Setlists, My Songs.
- Tools: expandable group with existing and future tool entries.
- Main chart/workspace area.
- Compact chart controls.

Mobile:

- Minimal top bar with brand, current context and menu.
- Mobile drawer mirrors Library and Tools hierarchy.
- Chart gets maximum width and vertical space.
- Persistent bottom controls only where useful: key, font, Live Mode.

### Product modes

- **Browse/Library:** find a song or setlist.
- **Prepare:** arrange a setlist, choose keys, add notes/transitions.
- **Read/Rehearse:** chart-first view with readable controls.
- **Live:** existing distraction-free player, visually refined but functionally preserved.

---

## Current implementation anchors

Inspect these before each phase; they are the likely integration points:

- `frontend/src/App.tsx` — view routing/application shell.
- `frontend/src/components/Nav.tsx` — current navigation/drawer and tools submenu.
- `frontend/src/styles/base.css` — global layout and typography.
- `frontend/src/styles/variables.css` — current theme tokens.
- `frontend/src/styles/components.css` — shared controls/cards/navigation.
- `frontend/src/styles/chord-sheet.css` — chord rendering styles.
- `frontend/src/styles/views.css` — view-specific layouts including setlists and Live Mode.
- `frontend/src/views/BrowseView.tsx` — public song/library entry point.
- `frontend/src/views/MySongsView.tsx` — owned library entry point.
- `frontend/src/views/SongView.tsx` — primary single-chart reading view.
- `frontend/src/views/SetlistEditView.tsx` — preparation workflow.
- `frontend/src/views/SetlistPlayView.tsx` — playback/Live Mode.
- `frontend/src/views/ToolsView.tsx` — tools launcher.
- `frontend/src/views/__tests__/App.auth-gate.test.tsx` and `App.routes.test.ts` — route/auth safety.
- `frontend/src/components/__tests__/Nav.test.tsx` — drawer and tools navigation behavior.
- `frontend/src/views/__tests__/SetlistPlayView.test.tsx` — Live Mode contract.
- `frontend/src/components/__tests__/SetlistEntryCard.test.tsx` — preparation-card contract.

Baseline: commit `9a28da2`; working tree was clean before this plan.

---

# Phase 0 — Baseline, design tokens and visual test harness

### Task 0.1: Record baseline and protect the dirty tree

**Files:** repository state only.

1. Run `git status --short`, `git log -1 --oneline`, and record the baseline.
2. Run existing frontend/backend tests and build once if possible.
3. Confirm local and public HTTP status separately.
4. Do not overwrite unrelated changes.

**Acceptance:** baseline is recorded; no user changes are lost.

### Task 0.2: Create the redesign token contract

**Files:**
- Modify: `frontend/src/styles/variables.css`.
- Possibly modify: `frontend/src/styles/base.css`.

Add semantic tokens for ink backgrounds, paper chart surfaces, amber chord/active state, sage ready state, text hierarchy, chart width, touch targets, radii and panel borders. Keep old aliases temporarily so migration is incremental.

**Acceptance:** tokens compile; existing light/dark themes retain readable contrast.

### Task 0.3: Add screenshot regression workflow

**Files:** scripts only if a repository-local helper is needed; do not commit personal screenshots.

Use Brave headless at 1440×1000, 1024×900 and 390×844. Document authenticated visual verification separately because protected chart paths require a real session.

**Acceptance:** screenshot command produces a non-empty image and generated images remain ignored.

---

# Phase 1 — Navigation and application shell

### Task 1.1: Write navigation behavior tests before restyling

**Files:** `frontend/src/components/__tests__/Nav.test.tsx`, `frontend/src/components/Nav.tsx`.

Cover signed-out visibility, signed-in/admin visibility, Tools `aria-expanded`, drawer close after child navigation, active parent/child state, Escape and focus restoration.

**Acceptance:** tests pass before visual changes.

### Task 1.2: Introduce a responsive shell layout

**Files:** `frontend/src/components/Nav.tsx`, `frontend/src/styles/components.css`, `frontend/src/styles/base.css`, and `frontend/src/App.tsx` only if a wrapper is needed.

Desktop gets a compact sidebar/rail; mobile keeps the drawer; Library and Tools remain distinct; no nested interactive controls; auth/admin rules do not change.

**Acceptance:** navigation tests pass; desktop/mobile screenshots show clear Library/Tools separation.

### Task 1.3: Refine branding without replacing functionality

**Files:** `frontend/src/assets/logo.svg` or current logo asset, `frontend/src/components/Nav.tsx`, auth branding and CSS as needed.

Create a simple chart-spine/chord-slash mark. Preserve derivative provenance, licence and upstream attribution surfaces.

**Acceptance:** served shell uses WorshipSessions identity and stale user-facing branding is absent except intentional migration/provenance text.

---

# Phase 2 — Chart-first reading experience

### Task 2.1: Inventory and test the single-song chart contract

**Files:** create/modify `frontend/src/views/__tests__/SongView.test.tsx`, `frontend/src/views/SongView.tsx`, `frontend/src/components/ChordSheet.tsx`, `frontend/src/styles/chord-sheet.css`.

Cover title/artist/key/BPM hierarchy, chord alignment, explicit section heading rows, mobile overflow, reachable controls and private/auth behavior. Preserve known PDF/text import regressions.

### Task 2.2: Restyle the chart header and metadata strip

**Files:** `frontend/src/views/SongView.tsx`, `frontend/src/styles/views.css`, `frontend/src/styles/chord-sheet.css`.

Make song title dominant, key a compact prominent badge, BPM/capo/artist secondary, edit/import actions secondary, and chart line length readable.

**Acceptance:** chart opens directly into readable content with no mobile horizontal overflow.

### Task 2.3: Add chart reading mode controls

**Files:** `frontend/src/views/SongView.tsx`, existing toolbar components, `frontend/src/styles/chord-sheet.css`, focused SongView tests.

Preserve/add compact font-size, chart light/dark surface, Nashville, transpose and section navigation controls where supported. All touch targets should be at least 44px.

### Task 2.4: Refine Live Mode without duplicating it

**Files:** `frontend/src/views/SetlistPlayView.tsx`, `frontend/src/styles/views.css`, existing Live Mode tests.

Align colours, chart surface and notes with the new system while preserving optional fullscreen/wake lock, controls reveal and large navigation.

---

# Phase 3 — Library and setlist orientation

### Task 3.1: Write library information-hierarchy tests

**Files:** `frontend/src/views/__tests__/BrowseView.test.tsx`, `MySongsView.test.tsx`, `BrowseView.tsx`, `MySongsView.tsx`.

Cover search priority, title/artist/key/BPM/tag visibility, obvious open action, useful empty/loading/error states, and signed-out/private boundaries.

### Task 3.2: Implement compact chart-library rows

**Files:** `BrowseView.tsx`, `MySongsView.tsx`, shared list/card styles.

Prefer compact rows or tiles; use chord/key/BPM metadata as anchors; reserve badges for meaningful information; retain fast mobile opening.

### Task 3.3: Refine setlist preparation layout

**Files:** `SetlistsView.tsx`, `PublicSetlistsView.tsx`, `SetlistEditView.tsx`, `SetlistEntryCard.tsx`, related CSS.

Make song number, title, performance key and BPM scannable; keep notes/transitions expandable but visible after saving; keep Play/Live obvious; preserve online/local setlists and preparation data.

---

# Phase 4 — Tools platform

### Task 4.1: Establish tool categories and extension contract

**Files:** `frontend/src/components/Nav.tsx`, `frontend/src/views/ToolsView.tsx`, and a registry such as `frontend/src/lib/tools.ts` if current lists are duplicated; tests in `ToolsView.test.tsx` and `Nav.test.tsx`.

Categories: Keys, Chords, Transposition, Song preparation and future implemented categories. Do not add fake placeholder tools.

**Acceptance:** one registry drives launcher/navigation; adding a tool requires one entry plus view/test.

### Task 4.2: Create a consistent tool page frame

**Files:** create `frontend/src/components/ToolPageFrame.tsx`; modify existing tool views; add representative tests.

Frame contains category, title/explanation, primary input/action, result area, copy/reset controls where useful, related tool links and Back to Tools.

**Acceptance:** at least three existing tools use the frame without changing domain logic.

### Task 4.3: Improve tools launcher discoverability

**Files:** `frontend/src/views/ToolsView.tsx` and tool CSS/tests.

Group tools by purpose, keep direct links working, preserve mobile scanning, and do not embed tool UIs into the launcher.

---

# Phase 5 — Authentication, empty states and polish

### Task 5.1: Redesign authentication surface

**Files:** `frontend/src/views/AuthView.tsx`, auth CSS/logo, `frontend/src/__tests__/App.auth-gate.test.tsx` and focused AuthView tests if needed.

Use edge-to-edge mobile layout, chart-spine identity, clear sign-in/register/invite paths, proper labels/autofill and loading/error states. Auth API behavior remains unchanged.

### Task 5.2: Unify loading, empty and error states

**Files:** `frontend/src/components/Loading.tsx`, `EmptyState.tsx`, shared CSS and focused tests.

Use the chart-line/spine motif and one clear next action per state.

### Task 5.3: Accessibility and reduced-motion audit

Check contrast, focus, drawer focus restoration, 44px touch targets, non-colour status indicators, `prefers-reduced-motion`, long titles and CJK layout.

---

# Phase 6 — Verification, rollout and rollback

### Task 6.1: Complete quality gate

From repository root:

```bash
npm test
npm run lint
```

From `frontend/`:

```bash
npm test
npm run lint
npm run build
```

Expected: all tests, typecheck/build and lint pass; only known non-blocking bundle-size warnings may remain.

### Task 6.2: Visual verification matrix

Verify desktop 1440×1000, tablet 1024×900 and mobile 390×844 for the shell, authenticated SongView, SetlistEditView, SetlistPlayView/Live Mode, Tools launcher and at least three tool pages. Do not treat public HTTP 200 as authenticated interaction proof.

### Task 6.3: Runtime/deployment verification

1. Build frontend into served `public/`.
2. Restart the local app.
3. Verify local HTTP 200.
4. Verify the temporary public URL separately and label it ephemeral.
5. Confirm served bundle contains the new identity and no stale assets are served.
6. Confirm `git status --short` is clean and `origin/main...main` is `0 0`.

### Task 6.4: Rollout commits

Use small reversible commits:

```text
feat: add WorshipSessions visual tokens
feat: add responsive library and tools shell
feat: refine chart-first reading view
feat: refine library and setlist surfaces
feat: unify tools page frame
feat: redesign authentication and empty states
```

Do not migrate the database for visual-only phases.

---

## Risks and mitigations

- Sidebar reduces chart width: collapse to drawer on mobile and cap width.
- Visual refactor breaks chart rendering: preserve ChordSheet/parser contracts and run import fixtures.
- Tools become crowded: registry, categories and expandable group.
- Theme inconsistency: semantic tokens and both-theme screenshots.
- Controls hidden during worship: preserve compact sticky controls and Live Mode tests.
- Derivative attribution accidentally erased: preserve licence/NOTICE/upstream provenance.
- Quick Tunnel mistaken for permanent hosting: report it as temporary.

## Open decisions before implementation

1. Desktop sidebar versus compact top navigation plus secondary rail.
2. Warm paper default versus dark default for normal chart reading.
3. Tools group expanded by default or collapsed until selected.
4. Proper original logo asset versus carefully designed CSS/icon shape; avoid crude generated SVG artwork.
5. First future tool category after the redesign.

## Definition of done

- A new user immediately understands WorshipSessions is for chord charts and worship teams.
- A returning team can find, open, transpose and use a chart faster than before.
- Setlists and Live Mode remain obvious but secondary to the chart.
- Tools are easy to discover and extend without clutter.
- Desktop, tablet and mobile layouts are intentional.
- Authentication, privacy, ownership, imports, setlist data and chart semantics remain intact.
- Full tests, lint, typecheck, build and live runtime verification pass.
