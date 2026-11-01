# Import fidelity checks

These checks use the repository's real publisher PDFs without saving songs or calling an OCR provider. They complement the default frontend tests; they do not establish accuracy for arbitrary photos or scanned documents.

## Run

Prerequisites: Node dependencies in root and frontend, Python with PyMuPDF, and the Playwright Chromium browser installed. Use a local scratch directory for generated artifacts. The example below is Git Bash on the development Windows machine:

```bash
cd frontend
PATH="/c/tmp/worshipsessions-qa/.venv/Scripts:$PATH" \
TMPDIR="C:/Users/jayel/AppData/Local/hermes/cache/scratch" \
WS_FIDELITY_OUTPUT="C:/Users/jayel/AppData/Local/hermes/cache/scratch/ws-fidelity" \
npm test -- --run src/lib/__tests__/import-fidelity.test.ts
cd ..
node scripts/verify_import_fidelity_layout.js C:/Users/jayel/AppData/Local/hermes/cache/scratch/ws-fidelity
```

For another environment, put a Python with PyMuPDF on PATH (or set WORSHIPSESSIONS_PYTHON) and select an appropriate WS_FIDELITY_OUTPUT directory. WS_FIDELITY_OUTPUT opts these two integration cases in; the default frontend suite skips them to remain independent of the Python extraction runtime. Keep all other test files enabled in the normal suite.

## Assertions

For Always On Time and Fall Like Rain:

1. Execute actual local PDF extraction, not mocked output.
2. Render the extracted chart through the production `renderChordPro` and chart CSS.
3. Assert the complete on-screen chord sequence matches extraction, including suffixes and slash basses.
4. Assert instrumental bar counts survive the HTML renderer.
5. Export through the production `exportSongPdf` and read the resulting PDF with PyMuPDF.
6. Compare all chord spans in draw order and the complete regular-text chart body (lyrics, section/repeat markers and beats), ignoring whitespace layout differences. These fixtures fit the default 9pt/10pt chord/body sizes; the comparison intentionally fails if the layout changes those assumptions.
7. In Chromium, measure each fixture at 320x740, 390x844 and 1440x950. Assert the expected chord count, no page/row horizontal overflow, and no measure split across visual lines.
8. Probe an artificially oversized measure to ensure the bounded fallback can reflow rather than overflow.

Output includes extracted `.cho`, exported `.pdf`, PDF-text JSON, standalone production-renderer HTML, six full-page screenshots and `layout-verification.json`. The standalone HTML is a fidelity harness, **not an authenticated application-route test**.

## Visual inspection findings

- Both source PDFs and generated exports were rasterized and inspected. The musical text and repeat sequence of the inspected fixtures survived the extraction/export chain; copyright/footer notices and publisher branding are not reproduced by the chart exporter.
- The phone check uncovered a real failure: adding barline `<wbr>` opportunities alone still allowed whitespace to wrap beat slashes away from their chord. Normal instrumental measures now have an atomic inline wrapper, with bounded internal reflow only when a measure itself is wider than the canvas.
- PDF pagination now keeps ordinary sections together. The corrected Always On Time export remains one page/two columns at 10pt body and 9pt chords, with Verse 2 entirely in the right column. Coordinate regressions prove the stock splitter breaks this section and the adapter does not. Long sections can flow across columns/pages without lost text; the exporter no longer silently shrinks all text to force a page count, and enforces a 7pt floor. The instance-local adapter guards its private ChordSheetJS layout boundary; rerun these tests on library upgrades.
- PDF header currently does not reproduce every source metadata field (for example BPM/time signature), despite metadata remaining in extracted ChordPro. Full publisher-page replication is not an acceptance claim.

## Generic multi-column safety gate

The generic PDF path now runs a bounded PyMuPDF geometry preflight before Poppler. Repeated non-musical text streams separated by a gutter and overlapping vertically are considered ambiguous; generic conversion stops with a page-specific error instead of merging columns. It does **not** guess column order. The unified API may then use its existing vision fallback, whose output still requires source review. A missing safety-check runtime also fails closed.

Generated real-PDF tests cover aligned/staggered off-centre columns, an unsafe later page, safe one-column lyrics, wide chord spacing, sequential non-overlapping regions, and an indented single stream with header/footer. Both real publisher PDFs are rejected by the generic path while still working through the supported publisher parser.

This is heuristic detection, not universal validation: narrow gutters or sparse layouts may escape detection, and unusual spacing can be conservatively rejected. Generic PDF import now needs Python/PyMuPDF as well as Poppler. The final Docker image now packages its own Python/PyMuPDF, Poppler and PDF scripts. A normal Docker build and the isolated offline runtime checks were exercised; see `container-pdf-runtime.md`. This verifies the built image, not a production deployment. Container vision recognition still requires a deliberately configured Hermes runtime; host credentials are not bundled into the image.

## Live vision-runtime verification

The importer no longer hardcodes the obsolete TheClawBay model. It inherits the host Hermes configuration and existing authenticated subscription/fallback policy, runs with only the read-only vision toolset, and does not enable YOLO approval bypass. Results deliberately report `provider=hermes, model=host-configured`; this is runtime provenance, not an unverified claim about which upstream model handled fallback. PNG/JPEG/WebP payloads keep a matching extension.

A real inference smoke test succeeded for the existing synthetic Living Hope raster. The actual authenticated binary HTTP upload was also exercised with an isolated in-memory test user/database: title/artist/key, all eight chords in sequence and all three lyric lines matched, with zero library writes. The authenticated request took about 50 seconds in this run; this is one measurement, not a promised latency. The subprocess default timeout is bounded at 120 seconds and is configurable.

To repeat **only when real model usage is intended**:

```bash
WS_LIVE_VISION=1 \
TMPDIR="C:/Users/jayel/AppData/Local/hermes/cache/scratch" \
WS_FIDELITY_OUTPUT="C:/Users/jayel/AppData/Local/hermes/cache/scratch/ws-fidelity" \
node --test test/liveVisionImport.test.js
```

This opt-in test is skipped by default. Transport/unit tests use stubs and are explicitly not recognition evidence. No production login credentials are used by the live test: its test-only bearer token and database are isolated. A genuine camera photo is still needed to establish skew/shadow/photographic accuracy; the synthetic raster is not represented as one.

## Remaining evidence boundaries

- This compares extraction to screen/export and visually checks two source fixtures. It is not a universal source-fidelity proof.
- Real camera photos (skew, shadows, handwriting), broader recognition accuracy beyond the tested synthetic raster, and large scanned documents remain unverified.
- No production chart was saved, bulk-rewritten or replaced by this harness. No commit, push or deployment is implied by a successful run.
