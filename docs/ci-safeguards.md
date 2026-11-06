# Phase 1 CI and release safeguards

## Local release gate

`.husky/pre-commit` uses `exec node scripts/check-release.js`. The runner executes
these gates sequentially and stops at the first nonzero exit, spawn error,
exception, missing result, or termination signal:

1. Staged-file lint (`lint-staged`).
2. Frontend project-reference typecheck (`tsc -b`, not `tsc --noEmit`).
3. Frontend unit tests (`vitest run`).
4. All backend `test/*.test.js` tests.

It invokes installed JavaScript entrypoints with the running Node executable,
absolute paths, explicit working directories, argument arrays and `shell: false`.
There is no dependency on Windows `.cmd` shell resolution, shell `cd` state, or
implicit shell glob expansion. Install both root/frontend dependencies first;
use the Node 24 runtime specified in `.nvmrc`. Python 3, PyMuPDF 1.26.7 and
Poppler are required for the document-processing tests.

`runReleaseChecks({ runner, log })` accepts an injected synchronous runner for
unit tests. Importing the module never executes commands. The regression suite
injects results at every gate and never invokes lint-staged or production
commits. The actual hook can modify staged files through lint-staged's normal
behavior; do not execute it merely to test failure propagation in a dirty tree.
The runner forces an in-memory DB, test mode, an ephemeral JWT secret, dotenv's
null-device path, and `WS_LIVE_VISION=0`; live model inference is not a release gate.

## CI definitions

`ci.yml` handles pushes/PRs targeting main, manual checks and reusable
`workflow_call`. Its quality gate installs backend/frontend dependencies,
Python 3.12, pinned `PyMuPDF==1.26.7`, and `poppler-utils`; verifies Node 24
against `.nvmrc`, package engines, the running runtime and every Docker Node base;
runs backend/frontend lint, backend/frontend tests, frontend `tsc -b` and build;
then runs an isolated authenticated HTTP smoke and the Chromium build-visibility/mismatch checks against the built app.

The smoke in `test/ciContract.test.js` starts the real assembled server on an
ephemeral loopback port. It passes a minimal environment, disables dotenv,
uses `DB_PATH=:memory:`, and creates a synthetic account only in that child's
memory. It verifies unauthenticated rejection, registration, login, authenticated
setlist reads and rejection of an invalid token, and stops the child in `finally`.
No real user DB, model credentials or provider endpoints are used. This is an
HTTP/API smoke, not a browser UI/E2E test. The older `test/smoke.js` is intentionally
not used: it is unauthenticated and assumes preexisting app/browser state.
The smoke also runs within the backend suite **before** the frontend build. By
default it is API-only: it serves a fresh empty scratch directory through
`WORSHIPSESSIONS_PUBLIC_DIR` and explicitly expects `/` to return **404**. It never
falls back to the repository's `public` directory, so a developer's old build
cannot mask a clean-checkout failure. The temporary public directory is removed
in `finally`, after closing the child server.

After the build, CI explicitly sets `WS_QA_PUBLIC_DIR=${{ github.workspace }}/public`.
This opt-in mode requires an absolute artifact directory containing a nonempty
`index.html` and valid `build-info.json` manifest, and expects `/` to return **200**.
Missing, relative or incomplete artifact paths fail rather than falling back to
API-only mode. Both modes preserve all authentication checks, the minimal child
environment and the in-memory database. On Windows, set
`TMPDIR=C:/Users/jayel/AppData/Local/hermes/cache/scratch` for local checks; CI uses
its separately created isolated scratch directory.

Startup diagnostics retain only the last 8192 characters of stderr internally;
exceptions expose allowlisted error codes, numeric exit status and known signals,
never arbitrary child output or error messages that could contain credentials.
Browser cleanup uses nested `finally` blocks so server shutdown and fixture
removal are attempted even if Chromium shutdown fails.

A successful quality gate permits CI's Docker **build only**, with `push: false`.
There is no registry login or package-write permission in CI. Workflow defaults
are `contents: read`; checkout does not persist credentials. Job timeouts bound
resource use. These are repository definitions, not GitHub settings or enforced
branch protection. Hooks remain locally bypassable; protected-branch required
checks would require separately authorized repository administration.

## Publishing is separate and opt-in

`docker.yml` has only `workflow_dispatch`, with boolean `publish` defaulting to
`false`. Its reusable quality-gate dependency must complete successfully
(including the nonpublishing image build) before its publish job can run. That
job additionally requires a manual dispatch with `inputs.publish == true`.
Only that job grants `packages: write` and logs into GHCR. It publishes a
revision-specific long-SHA tag, not a moving `latest` tag. No push, PR or tag
trigger publishes images. Defining this workflow does not authorize a publish;
no workflow was dispatched as part of this implementation.

Both Docker paths pass these build arguments:

- `WS_SOURCE_REVISION=${{ github.sha }}`
- `WS_SOURCE_DIRTY=false` (the checked-out CI revision, not a developer's tree)

The Dockerfile consumes these arguments in the frontend build stage and serializes
validated values into the build manifest carried into the runtime image. They do
not need to remain environment variables in the running container. Unused build
arguments would not embed identity. `npm run check:release` is the package alias;
the hook invokes the runner directly.

## Local regression checks and evidence boundary

```sh
node --test test/releaseGates.test.js test/ciContract.test.js
node node_modules/eslint/bin/eslint.js test/releaseGates.test.js test/ciContract.test.js
node --check scripts/check-release.js
bash -n .husky/pre-commit
git diff --check
```

The targeted tests cover injected gate failures and real isolated authentication.
Use Actions-aware expression validation (for example actionlint), not YAML parsing
alone. Parent integration also exercises the image under Node 24 and the browser
checks; see the Phase 1 verification report for exact execution results. Local
Node 26 execution alone is not evidence of Node 24 or GitHub Actions execution.
Running the hook's runner without staged files does not exercise an actual commit.
No commit, stage, push, deployment or workflow dispatch is implied by these tests.

The prior read-only GitHub API audit reported two active workflows and zero
runs. That observation does not identify a root cause and is not evidence of
successful GitHub CI. The referenced action tags were checked read-only against
GitHub. Hosted-runner execution, registry publishing and branch-protection behavior
remain unverified remotely.
