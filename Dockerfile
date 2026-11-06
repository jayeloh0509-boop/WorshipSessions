# Stage 1: Build frontend
FROM node:24-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json frontend/.npmrc ./
RUN npm ci
COPY frontend/ ./
# Build identity needs source inputs, not secrets or the host Git directory.
COPY package.json package-lock.json /app/
COPY server.js /app/server.js
COPY lib/ /app/lib/
COPY routes/ /app/routes/
COPY scripts/seed-data.mjs /app/scripts/seed-data.mjs
COPY scripts/extract_pdf_text.py scripts/render_pdf_pages.py /app/scripts/
COPY scripts/backup-db.js scripts/verify-db-backup.js /app/scripts/
ARG WS_SOURCE_REVISION=unknown
ARG WS_SOURCE_DIRTY=unknown
ENV WS_SOURCE_REVISION=${WS_SOURCE_REVISION}
ENV WS_SOURCE_DIRTY=${WS_SOURCE_DIRTY}
RUN npm run build

# Stage 2: Build backend native deps
FROM node:24-bookworm-slim AS backend
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 3: Final
FROM node:24-bookworm-slim
# Alpine 3.24 has no py3-pymupdf package. Use binary wheels on glibc
# rather than compiling MuPDF or relying on host Python packages.
RUN apt-get update && apt-get install -y --no-install-recommends \
      gosu python3 python3-venv poppler-utils wget ca-certificates \
    && python3 -m venv /opt/pdf-runtime \
    && /opt/pdf-runtime/bin/pip install --no-cache-dir --only-binary=:all: PyMuPDF==1.26.7 \
    && rm -rf /var/lib/apt/lists/*
ENV PATH="/opt/pdf-runtime/bin:${PATH}"
ENV WORSHIPSESSIONS_PYTHON="/opt/pdf-runtime/bin/python"
WORKDIR /app
COPY --from=backend /app/node_modules ./node_modules
COPY server.js package.json package-lock.json ./
COPY lib/ ./lib/
COPY routes/ ./routes/
COPY --from=frontend /app/public ./public
COPY public/locales ./public/locales
COPY scripts/seed-data.mjs ./scripts/seed-data.mjs
COPY scripts/extract_pdf_text.py scripts/render_pdf_pages.py ./scripts/
COPY scripts/backup-db.js scripts/verify-db-backup.js ./scripts/
COPY entrypoint.sh ./
RUN python -c "from pathlib import Path; p = Path('entrypoint.sh'); p.write_bytes(p.read_bytes().replace(b'\\r\\n', b'\\n'))" \
    && chmod +x entrypoint.sh && mkdir -p data \
    && python -c "import pymupdf; print('PyMuPDF', pymupdf.VersionBind)" \
    && pdftotext -v
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "entrypoint.sh"]
