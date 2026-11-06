# Security-only dependency follow-up — local verification

## Scope

Validated the compatible lockfile patch already present in the working tree. Direct dependency manifests and Express 5.2.1 remain unchanged. The patch covers:

- Backend: body-parser 2.4.0, proxy-addr 2.0.8, qs 6.17.1, iconv-lite 0.7.3.
- Browser runtime: DOMPurify 3.4.17 and fflate 0.8.3.
- Regression coverage: `test/dependencySecurity.test.js` checks every locked copy, installed metadata and actual Express dependency resolution; it does not claim exploit testing.

## Independently exercised

A fresh local Git clone received the owned candidate changes, excluding the five protected unrelated frontend edits, the planning file, production configuration/data and prebuilt assets. Dependencies were installed into that clone, not shared through junctions.

The default Windows `npm ci` attempted a native SQLite source build and failed because Visual Studio C++ build tools are unavailable. The bounded alternative was `npm ci --ignore-scripts` for both trees, then an actual in-memory native SQLite query. The native binary bundled with the locked package loaded successfully under Windows Node 24.18.0. No native binary was hand-copied and no global compiler/toolchain was installed.

Results:

- Backend production audit: **0 reported vulnerabilities**.
- Browser production audit: **0 reported vulnerabilities**.
- Dependency-floor/resolution regressions: **15/15 passed**.
- Full candidate backend suite: **214 passed / 3 skipped / 0 failed**.
- Frontend: **565 passed / 7 skipped**; project typecheck and production build passed.
- Backend lint passed. Frontend lint retained only the pre-existing `useAutoScroll.ts` warning; existing bundle-size warnings remain.
- Explicit built-artifact authenticated HTTP suite: **12/12 passed**.
- Browser build-status checks passed at 320, 390, 430 and 1440px, including the controlled mismatch state and owner diagnostics.
- Production Docker image built with the candidate locks. Actual Node **24.22.2** runtime reported Express 5.2.1 and the patched backend versions, `/api/health` **200**, and `backendMatchesBuild: true`.
- Real image PDF-runtime suite: **4/4 passed**, including native SQLite, local document extraction and page/column guards. No model inference.

## Remaining exposure and boundaries

The full browser development dependency audit still reports **17 findings: 12 moderate, 5 high, 0 critical**. These include lint/test/build/dev-server tooling, not dependencies included by the production audit. This is not proof that development/build environments are risk-free; handle the toolchain in a separate reviewed slice rather than forcing broad or incompatible changes into this patch.

Zero production audit findings means no findings reported by the current advisory service for these locks. It is not a comprehensive application-security clearance.

The current source tree and Phase 1 implementation remain uncommitted. No push, hosted CI run, publication, live-service restart or deployment was performed. The running service has not been restarted onto this patch. Public build verification, publication approval and the separate tooling-advisory decision remain outside this local verification.

Independent review accepted the lockfile patch and regression tests, with no critical/code blockers. The requested documentation correction was applied and independently re-reviewed: PASS. Remaining exposure includes build/dev-server/test tooling, and some findings have ordinary compatible fix paths. No blanket tooling clearance or comprehensive security claim is made.
