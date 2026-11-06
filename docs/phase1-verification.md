# Phase 1 — local verification report

## Status

Phase 1 local implementation is complete. Working-tree and cold-clone execution checks pass, including the corrected pre-build/post-build smoke boundary. Independent specification, quality and final integration reviews are approved with no outstanding implementation blockers. At initial completion, production dependency advisories remained a release blocker. The subsequent security-only follow-up now reports zero backend/browser production audit findings; see [security-verification.md](security-verification.md) for current results and remaining tooling risks. Completion of either local slice is not publication or deployment approval.

No Phase 1 commit, staging, push, image publication, workflow dispatch, public deployment, service restart, live restore, backup schedule or GitHub setting change was performed.

## What changed

- Fail-fast cross-platform release runner and pre-commit hook, with injected failure/signal/spawn-error tests. Staged lint, frontend project typecheck/tests and backend tests run sequentially; failure stops later checks.
- Read-only CI quality definitions with Node 24, Python/PyMuPDF/Poppler prerequisites, lint/tests/build, isolated authenticated HTTP smoke and Chromium build-status checks. Image publication requires explicit default-false manual opt-in and successful quality dependencies.
- Per-artifact build identity embedded into frontend JavaScript and a manifest, validated source revision/dirty state, package-labelled version and backend/frontend fingerprints. The backend fingerprint includes the five shipped executable helpers; the build/runtime Docker stages use identical helper inputs.
- Frozen server-startup identity and safe public build/health endpoints. Settings displays matching, unknown and mismatched identity without interrupting Live Mode or automatically reloading unsaved work. Owner-only runtime diagnostics expose bounded capability/integrity booleans, not command output, paths, config or credentials.
- Explicit dotenv path selection so synthetic smoke tests do not silently consume deployment `.env` configuration.
- Non-overwriting SQLite online-backup and isolated recovery CLIs. Verified snapshots publish exclusively, preserve committed WAL data, reopen with integrity/FK checks and refuse existing destinations/aliases/sidecars. Recovery cannot replace a live database.
- README corrections and operational, CI, backup/recovery and existing-security-advisory documentation.

## Executed verification

- Working-tree release checks previously passed frontend **567 / 5 skipped**. Final cold candidate verification excluded the five unrelated dirty frontend files, production configuration/data and all prebuilt assets: frontend **565 passed / 7 skipped**; backend **199 passed / 3 skipped**, no failures. Frontend typecheck passed. Additional cold skips are explicitly data-dependent tests without a development database. Dependencies were shared through local junctions to the unchanged locked installations; this was not a fresh npm install or hosted CI run.
- Cold verification found the same ignored-HTML assumption in the older startup/CSP test; its assertion now checks the API health surface. A changelog unit test now explicitly selects an in-memory database instead of relying on a developer database.
- After the cold build, explicit built-artifact HTTP contracts **12/12** and authenticated browser checks passed. No staged files existed; no real commit was performed.
- Backend lint: passed. Frontend lint: no errors; the pre-existing `useAutoScroll.ts` React Compiler warning remains.
- Isolated frontend production build: passed, outside the running site's `public/`. Existing large-bundle warnings remain.
- Authenticated Chromium checks: matching build at **320, 390, 430 and 1440px**, no horizontal page overflow, owner diagnostics, and an explicitly intercepted stale-server metadata case producing the mismatch warning. Uses a fresh synthetic database/account and ephemeral localhost server, not the saved owner login or production DB.
- Local Docker image built successfully under **Node 24.22.2**. **22/22** backup/build-identity tests passed with no network, a read-only filesystem, unprivileged user and synthetic tmpfs fixtures; repository-only Dockerfile input was mounted read-only for the static context contract.
- Additional final CI/harness/startup/recovered-app regressions: **24/24 passed under Node 24**, unprivileged, read-only and network-disabled with test-only source mounts.
- Real image PDF packaging suite: **4/4 passed**, including actual isolated PDF extraction, publisher and generic-column guards, four-page rendering and five-page refusal. No model-provider inference.
- Rebuilt image HTTP health: **200**, revision/modified-state recorded and `backendMatchesBuild: true`. Earlier isolated runtime probing verified packaged Python, PyMuPDF, Poppler and scripts, and UID 1000 application startup.
- Actions-aware validation: actionlint passed after correcting an invalid job-level expression context. Referenced action tags were verified read-only against GitHub. These checks do not establish an actual hosted workflow run.
- Test-first regressions reproduced ineffective dotenv isolation, omitted executable-helper fingerprints, invalid manifest primitive coercion, staging-directory cleanup on permission failure and clean-checkout HTML prerequisites before fixes passed. The startup-ID manifest-replacement check is now a permanent integration test.

## Backup and recovery evidence

A private verified snapshot is retained outside the prunable scratch cache:

`data/backups/phase1-2026-11-01T13-40-25-173Z-ddf76f.sqlite`

- Size verified during creation: **8,237,056 bytes**.
- Reopened SQLite integrity: **ok**.
- Foreign-key violations: **0**.
- Isolated recovered copy's song, setlist, entry and section hashes match the protected baseline.
- Separate synthetic recovered-app HTTP smoke verifies original IDs, preparation data, owner reads and another user's rejection from private resources.
- No actual service was pointed at the recovered copy. The retained snapshot is sensitive, unencrypted and local-only; it was not uploaded or included in Docker context. No off-machine replication or freshness schedule is established.

## Preservation checks

The five unrelated edited frontend files and the approved roadmap were hash-checked against the captured baseline. Song/setlist/entry/section content hashes and the running site's HTML were also checked. The site was neither rebuilt in place nor restarted. HEAD remains the previously published rehearsal commit; the index remains empty.

## Remaining risks and next step

1. The initial production findings were resolved by the subsequent minimal lockfile patch; see `security-verification.md`. Development/build/test-tooling advisories remain unresolved and require separate compatibility/reachability review, including ordinary compatible fixes where available.
2. The read-only GitHub audit found two active workflows and zero recorded runs. Root cause and actual hosted CI remain unverified. Local workflow changes are not applied remotely until an approved publication.
3. Package metadata remains 1.22.1 while product changelog history is v1.23.x. The UI deliberately labels package version; source SHA/build ID identify the artifact. Reconcile numbering deliberately at the next approved release.
4. No continuous filesystem attestation, power-loss directory durability, hostile-directory race guarantee, backup encryption/replication, automatic retention or live replacement procedure is claimed.
5. Public deployment, physical-device behavior, real-photo OCR and durable offline cold-start remain separate future acceptance gates.

The recommended runtime dependency-security follow-up has now passed local release/container verification. Next, review the remaining tooling findings separately and obtain explicit publication approval before verifying actual hosted GitHub CI and the deployed build. Local verification does not authorize deployment or Phase 2 feature expansion.
