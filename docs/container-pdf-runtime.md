# Container PDF runtime

## Runtime contents

All build stages use `node:24-bookworm-slim` so `better-sqlite3` and the
runtime share glibc. The final image includes Python 3, a private Python venv
with binary-only `PyMuPDF==1.26.7`, Poppler (`pdftotext`), both
`scripts/extract_pdf_text.py` and `scripts/render_pdf_pages.py`, and the
existing demo seed script. `WORSHIPSESSIONS_PYTHON` selects the venv;
`python` is also on PATH for existing callers. Build-time imports verify the
Python module and Poppler executable. No host Python installation is needed.

The tested `node:24-alpine` resolved to Alpine 3.24.3, where
`apk add --no-cache python3 py3-pymupdf poppler-utils` failed with
`py3-pymupdf (no such package)`. Debian permits an actual manylinux wheel
installation instead of a MuPDF source compilation. The entrypoint uses
`gosu` instead of `su-exec`, preserving the data-owner UID/GID handoff,
demo-mode condition, command and healthcheck. Its line endings are normalized
inside the image for Windows checkouts.

## Build (Bash, from repository root)

The `.dockerignore` allowlists the two PDF scripts and the existing seed
script, while excluding host dependencies, environment files, data and Git
metadata. The ordinary build path was verified (no special tar workaround):

```bash
docker build --progress=plain -t worshipsessions:import-fidelity-verified .
```

On this Windows Git Bash host, replace `docker` with
`"C:/Program Files/Docker/Docker/resources/bin/docker.exe"`.
Docker Desktop was started successfully with:

```bash
"C:/Program Files/Docker/Docker/resources/bin/docker.exe" desktop start
```

The build downloads public Node/Debian/npm/PyPI dependencies. It does not
contact an OCR/model provider or run the application server. Existing npm
audit warnings were reported (backend: 3; frontend: 19); no dependency/library
updates were made as part of runtime packaging.

## Isolated smoke test

```bash
PDF_SMOKE_IMAGE=worshipsessions:import-fidelity-verified \
  node --test test/dockerPackaging.test.js
```

Exact Windows command used:

```bash
DOCKER_BIN='C:/Program Files/Docker/Docker/resources/bin/docker.exe' \
PDF_SMOKE_IMAGE=worshipsessions:import-fidelity-verified \
  node --test test/dockerPackaging.test.js
```

Without `PDF_SMOKE_IMAGE`, only static packaging tests run and the real image
check is explicitly skipped. With it, the test starts a uniquely named,
auto-removed disposable container, with `--pull=never --network=none
--read-only --cap-drop=ALL --security-opt=no-new-privileges --user=1000:1000`.
Only fixture files and the smoke script are mounted, both read-only. Temporary
outputs live in a 128 MiB `/tmp` tmpfs. No data volume, credentials, environment
file, listening port, production database or deployment is used. SQLite is
opened only as `:memory:` to check the native binary ABI. The application
server and provider modules are never loaded.

Checks exercise the final image's own libraries and Python scripts:

- Python/PyMuPDF and Poppler availability; native SQLite ABI.
- Clean Living Hope generic PDF: title, key, intact lyrics and chord markers.
- Fall Like Rain and Always On Time publisher fixtures: titles, keys,
  word-aligned chords; Always On Time section ordering and intro bars.
- Both publisher PDFs and a locally generated parallel-column PDF reject
  generic extraction instead of silently interleaving lyric streams.
- Four-page contact sheet renders successfully with full-height dimensions.
- Five-page input rejects with the explicit split-PDF error and no output.

Poppler's character-column quantization differs by version. Debian Poppler
22.12.0 produced `[G]How great the cha[C]sm...`, whereas the existing Windows
regression expected `[G]How great th[C]e chasm...`. The container smoke checks
intact lyric text and chord presence rather than incorrectly hardcoding the
Windows Poppler offsets. Publisher coordinate-aware word-alignment checks
remain exact.

## Verified result

Actual image build and the real-container test completed successfully:
4 tests passed, zero failed/skipped; the container reported 8 successful
runtime checks. Python/PyMuPDF was 1.26.7; Poppler was 22.12.0.

Image tag: `worshipsessions:import-fidelity-verified`

Read the current image identity with:
`docker image inspect --format '{{.Id}}' worshipsessions:import-fidelity-verified`

A separate offline disposable container exercised the actual entrypoint
with a harmless stub `node` executable: root-owned data executed as UID 0;
UID/GID 1000-owned data switched successfully to UID 1000 with `gosu`.
It did not start the server or create a database. Existing containers/images
were not deleted, and no production deployment was started. These verification
commands do not publish source or images. Docker Desktop remains running,
and the test image is retained for inspection. Vision OCR is optional and
requires a separately configured Hermes runtime; no host model credentials
are copied into this image.
