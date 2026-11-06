# Release and recovery operations

## Phase 1 boundary

These safeguards are local changes pending review/publication. They do not prove that the public deployment has changed or that GitHub executed the workflows. Do not restart, deploy, publish, alter GitHub settings or restore over a live database merely to validate them.

The existing running site and unrelated working-tree edits must remain untouched. A build defaults to writing `public/`, which the running server serves: **use a separate output directory for local verification**.

## Before a release

1. Inspect branch, HEAD, dirty paths and staged changes. Record which files belong to the approved slice and hash unrelated edits.
2. Run `npm run check:release` with supported dependencies. This performs staged lint, frontend project typecheck/tests and backend tests, failing immediately on the first error. It does not build or publish.
3. Run backend and frontend lint explicitly when validating an unstaged slice (`npm run lint`, then `npm --prefix frontend run lint`). Staged lint is not a substitute for an unstaged audit.
4. Build a fresh isolated artifact; never reuse an unverified artifact from a different source revision.
5. Run isolated HTTP/browser and relevant PDF/container gates. Keep live model inference opt-in and out of routine CI.
6. Verify a consistent database backup and isolated recovery drill. Keep private snapshots out of Git, reports and shared artifacts.
7. With explicit release approval only: commit the owned paths, inspect what hooks actually committed, push and compare the exact remote SHA. Changelog publication and deployed build verification are separate steps.

Example local validation on this Windows machine (choose a fresh scratch directory, not a live deployment directory):

```sh
export TMPDIR='C:/Users/jayel/AppData/Local/hermes/cache/scratch'
export WORSHIPSESSIONS_PYTHON='C:/path/to/supported-pdf-runtime/python.exe'
npm run check:release
npm --prefix frontend run build -- --outDir 'C:/Users/jayel/AppData/Local/hermes/cache/scratch/your-new-build-directory'
```

For a standalone preview, copy the existing static locales into that isolated directory. Then run the synthetic-account browser check:

```sh
WS_QA_PUBLIC_DIR='C:/Users/jayel/AppData/Local/hermes/cache/scratch/your-new-build-directory' node test/buildVisibility.e2e.js
```

The browser check creates its own database, authenticated fixture account and ephemeral localhost server. It does not use the owner's login, production database or public URL. Negative mismatch UI verification uses an explicit intercepted metadata response, not a real deployment failure. Browser emulation is not a physical-device certificate.

## Build identity and status

Each Vite build embeds one build ID in its JavaScript and emits a `build-info.json` artifact. Inputs include validated source revision/state, package version, timestamp and source fingerprints. Configuration values, paths, credentials and database content are not included.

- `GET /api/build`: sanitized, non-cached metadata loaded at server startup. This is intentionally frozen: copying a new frontend over an old process cannot make that process claim it loaded the new artifact.
- Settings → **Build information**: compares the browser's embedded ID with the server's ID. A mismatch warns rather than silently claiming success or automatically discarding unsaved work.
- Backend source fingerprints are compared against the build's expected backend inputs. A mismatch requires an intentional rebuild/restart; the tool never does that automatically.
- Missing/invalid manifests report unknown/unavailable. Old installations remain usable; unknown must not be reported as a verified release.
- `GET /api/health`: a minimal connection/readability health check. It is **not** proof of chart fidelity, dependency completeness, correct account permissions or release readiness.
- `GET /api/admin/runtime-status`: owner-only, no-store, bounded/cached runtime checks. Reports database integrity result and Python/PyMuPDF/Poppler/script availability without command output, paths or secret values. Vision inference is explicitly not tested. Admin/user/unauthenticated requests cannot trigger probes.

The package version is labelled **Package**, not product release. Existing 1.22.1 package metadata and v1.23.x product changelog history are not silently rewritten by Phase 1; use source SHA/build ID to identify the actual artifact. Reconcile release numbering deliberately at a later approved publication.

An operator-supplied `WORSHIPSESSIONS_PUBLIC_DIR` selects an isolated artifact directory. `DOTENV_CONFIG_PATH` is honored explicitly, allowing tests to use the null device rather than read a deployment's `.env`. With no override, normal `.env` behavior is preserved. Do not set these on the live service merely to run tests.

### Docker builds

Supply source identity when building from a source archive without `.git`:

```sh
docker build --build-arg WS_SOURCE_REVISION='<exact-source-sha>' --build-arg WS_SOURCE_DIRTY=false -t worshipsessions:your-reviewed-tag .
```

Use `WS_SOURCE_DIRTY=true` for a modified working tree. Absent/invalid metadata becomes unknown rather than a fabricated clean revision. The image packages its build identity, backup CLIs and document runtime. The health check uses the configured `PORT` and `/api/health`. A locally built/tested image is not a deployed image.

## Backups and recovery

Use the explicit-path commands in [backup-recovery.md](backup-recovery.md). They do not load `.env` or guess a database path. They refuse existing targets, aliases and sidecars and use the SQLite online backup API so committed WAL data is included.

A backup is sensitive and unencrypted: it includes account password hashes, private charts, settings and relationships. Unix mode bits do not establish Windows ACL protection. Choose a trusted directory with appropriate access control. No upload, retention deletion, off-machine replication or automatic schedule is included.

Recovery verification copies into a fresh, isolated target outside the backup directory tree. Tests additionally start the application against a recovered **synthetic** database and verify owner access, private-song isolation, stable IDs and preparation data. This is not authorization to start the production service against a restored copy.

A future live restore requires an explicit maintenance approval, a verified pre-restore backup, stopping the correct service, compatible application/schema identification, intentional handling of database/WAL/SHM files, readback checks and a rollback plan. No automated live replacement command is provided here.

## CI/CD and release boundaries

See [ci-safeguards.md](ci-safeguards.md). CI workflows include document prerequisites and isolated auth smoke. Docker publication is a separate manual opt-in dependent on quality checks; default is not to publish. Normal pushes/PRs validate, not deploy.

Read-only GitHub inspection during Phase 1 found two active workflows and zero recorded workflow runs. That establishes neither a disabled-workflow diagnosis nor successful CI. The operator must inspect repository/organization Actions permissions and event/token provenance if missing runs persist. Such settings changes and a remote validation push need approval.

Workflow validation must include an Actions-aware checker, not YAML parsing alone: valid YAML may still use expressions in contexts GitHub disallows. Local actionlint validation is useful but cannot replace an actual workflow run.

## Existing dependency release blockers

The initial production dependency audit findings are retained separately in
[security-advisories.md](security-advisories.md). The subsequent minimal security
patch and fresh verification are documented in [security-verification.md](security-verification.md);
backend/browser production audits now report zero findings. Build-time tooling
advisories remain, and passing these gates is not a comprehensive security clearance.

## Explicit limitations

- No deployment, image publication, public-domain/tunnel change, live restore, automated backup scheduling or remote account change is authorized by local tests.
- SQLite integrity/foreign-key checks are not a full business-data audit. The synthetic app recovery smoke covers a bounded path, not every historical database or optional extension.
- Hardlink-based exclusive publication requires a supported trusted filesystem; hostile directory races, off-machine recovery and power-loss directory durability are not promised.
- Read-only WAL access may touch shared-memory sidecars, even though source tables remain unchanged.
- Physical-phone behavior, public URL verification and genuine-photo OCR remain separate gates.
