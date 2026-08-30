# WorshipSessions Entry Experience Redesign

## Goal
Create a cohesive, polished first-run experience across the login page, application loading state, and authenticated home page without disrupting existing authentication, routing, chart viewing, or mobile Live Mode behavior.

## Design direction

Use a warm, musician-focused visual system rather than a generic SaaS dashboard:

- Deep charcoal/ink base with restrained orange/gold accent drawn from the existing WorshipSessions palette.
- Soft atmospheric background treatment: subtle radial glow and faint music/staff motif, implemented with CSS rather than a heavy image dependency.
- Compact, intentional surfaces with clear hierarchy; avoid oversized floating cards and excessive decoration.
- Mobile-first layouts that remain comfortable on a phone and scale naturally to desktop.
- Accessible contrast, visible focus states, semantic headings, keyboard navigation, reduced-motion support, and no reliance on color alone.

## Proposed screens

### 1. Login / authentication page

**Structure**

- Split composition on desktop: brand/story panel on the left, focused auth panel on the right.
- Single-column composition on mobile with brand mark and short value proposition above the form.
- Keep the existing login/register/invite flows and Turnstile behavior intact.

**Brand panel**

- WorshipSessions wordmark with a small music/chord mark.
- Headline such as “Charts, Keys, Setlists.”
- Short supporting copy: keep charts organized, readable, and ready for rehearsal or live use.
- Three small capability cues: chord charts, setlists, Live Mode.

**Form panel**

- Clear “Welcome back” heading and concise helper text.
- Labeled username and password fields with improved spacing and input affordances.
- Primary sign-in button with a loading/disabled state during submission.
- Secondary register/invite actions presented as quiet links or segmented controls, not competing large buttons.
- Inline error region with `role=alert`; preserve existing translated strings.
- Optional demo mode remains obvious but visually secondary.

**Do not change**

- API endpoints, credentials, validation, invite flow, Turnstile loading, or auth redirects.

### 2. Loading screen

Replace the generic music-note empty state used while the app initializes with a branded loading experience:

- Centered WorshipSessions mark.
- Small animated progress indicator or three-pulse chord motif.
- Message such as “Getting your songs ready…” using the existing i18n key where possible.
- CSS animation disabled or simplified under `prefers-reduced-motion`.
- Minimum visual layout shift; use a stable full-viewport shell.
- Loading state must remain lightweight and not delay app readiness.

### 3. Authenticated home page

Treat the current Browse experience as the home destination, while preserving its search/catalog behavior.

**Header / welcome zone**

- Personalized greeting when the user is known, otherwise the public discovery headline.
- One-line context showing the next useful action.
- Prominent but compact actions: `New Song`, `Create Setlist`, and `Browse Charts` as appropriate to permissions.

**Quick action row**

- New Song
- New Setlist
- Import Chart (if existing route/flow supports it)
- Tools

Use grouped controls with short labels and icons; avoid oversized dashboard tiles.

**Library summary**

- “Your library” section for the authenticated user.
- Small stat row: songs, setlists, recently updated.
- Recent songs list/grid with key and BPM visible where available.
- Empty state that explains the first action instead of only saying no songs exist.

**Discovery section**

- Retain public chart search and filters.
- Label it clearly as “Explore charts” or “Public charts.”
- Keep query, language filter, pagination, and URL/session persistence behavior unchanged.

**Responsive behavior**

- Mobile: stacked sections, horizontal quick-action scrolling only where necessary, no clipped controls.
- Desktop: constrained readable content width with balanced two-column library/discovery arrangement.
- Existing navigation remains the source of truth; do not duplicate navigation actions excessively.

## Implementation phases

1. **Baseline and contracts**
   - Inspect current global variables, auth tests, app initialization, route transitions, and Browse data loading.
   - Identify the exact loading boundary and avoid changing API behavior.
   - Add/adjust component-level tests before visual edits where behavior is currently untested.

2. **Shared visual primitives**
   - Add scoped entry-page classes and reusable brand/section primitives.
   - Define spacing, surface, accent, focus, and responsive tokens using existing variables where possible.
   - Add reduced-motion and high-contrast-safe states.

3. **Login redesign**
   - Refactor markup only as needed for semantic grouping and accessible labels.
   - Preserve all existing auth state transitions and test them.
   - Add tests for login, register, invite, error, Turnstile, and submitting states.

4. **Loading redesign**
   - Replace the generic loading markup with a stable branded component.
   - Add a reduced-motion test or deterministic class behavior if animation is abstracted.

5. **Home redesign**
   - Add authenticated welcome/library summary without duplicating network calls unnecessarily.
   - Preserve public Browse mode for signed-out users.
   - Ensure empty, loading, error, search, filter, pagination, and mobile layouts are covered.

6. **Visual QA and release**
   - Run frontend tests, lint, format check, production build, and diff check.
   - Inspect at mobile and desktop viewport sizes, including auth errors and empty library.
   - Verify routes, sign-in redirect, search, New Song, and Live Mode entry.
   - Commit and deploy only after the behavior and visual checks pass.

## Acceptance criteria

- Login, loading, and home page share one coherent visual language.
- Existing login/register/invite behavior is unchanged and covered by tests.
- Loading UI is branded, stable, lightweight, and reduced-motion friendly.
- Authenticated home clearly surfaces the user’s library and useful next actions.
- Public Browse/search still works for signed-out users.
- No regressions to chart rendering, setlists, Live Mode, or navigation.
- Responsive layout is usable at phone width and desktop width.
- Accessibility: semantic headings, labels, focus states, alert errors, keyboard usability, and sufficient contrast.
- Frontend tests, lint, format, build, and `git diff --check` pass.

## Open choices for implementation

- Whether the home page should show a compact “recently opened” list based on existing data only, or add a new last-opened persistence field.
- Whether import should be a first-class home action or remain inside New Song.
- Whether the brand panel uses CSS-only musical texture or a small generated SVG asset.

## Recommended default

Proceed with the CSS-only musical texture, existing data only, and keep Import Chart inside the existing New Song/import flow for the first iteration. This delivers a visible improvement without adding persistence or routing complexity.
