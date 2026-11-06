# Existing production dependency advisories

Read-only `npm audit --omit=dev --json` during Phase 1 reported three affected transitive packages: one critical, one high and one moderate. The local Docker dependency installation reported the same severity totals. No dependency or lockfile was changed to suppress these findings.

## Original findings (resolved locally below)

- **Critical — `proxy-addr`**, affected `1.1.0–2.0.7`: IP spoofing involving IPv4-mapped IPv6 trust subnets. [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).
- **High — `body-parser`**, affected through `2.3.0`: denial of service involving trailing bytes after a compressed request body. [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828).
- **Moderate — `qs`**, audit range `2.2.5–6.16.0`: multiple parsing/stringification denial-of-service or limit-bypass advisories. [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx), [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g), [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw).

`fixAvailable: true` was reported for each package; that is not proof that a blind audit-fix command is compatible or sufficient.

## Bounded reachability observations

The server uses `express.json(...)` and trusts one proxy hop (`app.set('trust proxy', 1)`). These observations do not establish exploitability of every advisory. In particular, hop-count trust is not the subnet configuration named by the proxy advisory. This is **not** a clearance: deployed reverse-proxy topology, request parsing, transitive call paths and fixed dependency versions still require a focused audit.

Do not run exploit payloads against the live service to prove reachability. Do not automatically accept major dependency upgrades or modify protected working-tree changes.

## Next release gate

Before deployment, perform a small dependency-only local slice:

1. Establish exact locked versions, dependency paths and the latest advisory ranges.
2. Select minimal compatible patched transitive versions; inspect the lockfile diff.
3. Run backend/frontend tests, lint/typecheck, isolated authenticated/browser smoke and the real Node 24 container/document gates.
4. Re-run the production audit and document any remaining exception explicitly.
5. Obtain the separate publication/deployment approval required by the current project boundary.

A passing application test suite and a successful container build do not make an image with known unresolved advisories deployment-ready. Offline packs and other feature work should not displace this security gate.

## Applied remediation (local, uncommitted)

A minimal, reviewed lockfile-only patch was applied and verified against a fresh install; `package.json` and the direct Express version are unchanged.

| Package | Before | After | Advisory floor |
| --- | --- | --- | --- |
| `body-parser` | 2.3.0 | 2.4.0 | 2.4.0 |
| `proxy-addr` | 2.0.7 | 2.0.8 | 2.0.8 |
| `qs` | 6.15.3 | 6.17.1 | 6.16.1 |
| `iconv-lite` | 0.7.2 | 0.7.3 | required by `body-parser` 2.4.0 |
| `dompurify` (browser runtime) | 3.4.14 | 3.4.17 | 3.4.17 |
| `fflate` (browser runtime) | 0.8.2 | 0.8.3 | 0.8.3 |

The DOMPurify and fflate findings appeared only when the container installed the browser dependency tree from scratch; they were not visible in the original root audit. Both are production browser dependencies.

The qs regression intentionally retains 6.17.1, above the cited 6.16.1 advisory minimum. Browser regression assertions cover locked copies only; fresh frontend installation and build verification separately exercise the installed candidate.

Verified on an isolated candidate with fresh installs:

- Server production audit: **0 vulnerabilities**. Browser production audit: **0 vulnerabilities**.
- Backend **214 passed / 3 skipped**; frontend **565 passed / 7 skipped**; lint clean apart from the pre-existing warning; build passed.
- Node 24 container started with `body-parser` 2.4.0, `proxy-addr` 2.0.8, `qs` 6.17.1, `iconv-lite` 0.7.3, Express 5.2.1, and `/api/health` returning 200 with a matching build identity.
- New regression file `test/dependencySecurity.test.js` asserts locked and installed versions meet the patched floors and that Express stays a locked stable 5.x runtime.

Fresh revalidation, the native-install workaround and remaining boundaries are documented in [security-verification.md](security-verification.md).

## Remaining exposure

- The browser **development/build/test-tooling** graph still reports 17 affected packages (12 moderate, 5 high, 0 critical), including Vite, Vitest/@vitest/mocker, undici, source-map-js, brace-expansion and zod as well as lint/typecheck tooling. Some findings have ordinary `fixAvailable: true` paths; others suggest broader or major-version replacements. They require individual compatibility and reachability review, not a blanket claim that all fixes are major or that development environments are safe. These findings were kept outside this runtime-only slice, not cleared.
- Dependency floors are version assertions, not proof that the application is free of exploitable paths. Reachability was not tested with attack payloads, by design.
- No hosted CI run, deployment or production restart was performed. The running installation still uses the previous dependency installation until an approved deployment.
