# Admin Changelog — Implementation Plan

## Scope

Add an admin-only changelog editor to WorshipSessions. Admins and owners can manage release notes; regular users and signed-out visitors have no changelog route yet.

## Data model

Add `changelog_entries` to the existing SQLite initialization:

- `id`
- `version` (required, bounded text)
- `title` (required, bounded text)
- `summary` (required, bounded text)
- `body` (required, bounded text)
- `status` (`draft` or `published`)
- `published_at`
- `created_by` / `updated_by` foreign keys to users
- `created_at` / `updated_at`

Add indexes for status/date and author.

## API

Add `routes/admin-changelog.js` or extend the admin router with:

- `GET /api/admin/changelog` — list all entries for admins, newest first
- `POST /api/admin/changelog` — create a draft
- `PUT /api/admin/changelog/:id` — update draft or published content
- `POST /api/admin/changelog/:id/publish` — publish and timestamp an entry
- `POST /api/admin/changelog/:id/unpublish` — return it to draft
- `DELETE /api/admin/changelog/:id` — delete an entry

All endpoints require authentication, admin authorization, and demo-mode write protection where appropriate. Validate IDs, text lengths, status transitions, and missing fields. Use model methods and parameterized SQL.

## Frontend

Add a Changelog section to `AdminView` with:

- list of entries grouped by status
- create form
- edit form
- publish/unpublish controls
- delete confirmation
- success/error toasts
- clear empty states and loading states

Keep the feature inside the existing admin dashboard; no new navigation item is needed.

## Tests

- model CRUD and status transitions
- API authorization: unauthenticated and regular users receive 401/403
- validation and not-found behavior
- admin view rendering and core create/edit/publish interactions
- full existing backend/frontend test, lint, build, format, and audit gates

## Safety

- Do not expose drafts through any non-admin endpoint.
- Do not add public reading behavior until explicitly requested.
- Do not alter existing admin/user role semantics.
- Do not commit or push until independent review passes.
