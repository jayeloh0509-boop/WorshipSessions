import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createBuildIdentity } = require('../lib/buildIdentity.js');
const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ command }) => {
  const identity = command === 'build' ? createBuildIdentity(root) : null;
  return {
    plugins: [
      react(),
      {
        name: 'worshipsessions-build-identity',
        generateBundle() {
          if (identity)
            this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify(identity, null, 2) });
        },
      },
    ],
    define: { __WS_BUILD_ID__: JSON.stringify(identity?.buildId ?? null) },
    build: {
      outDir: '../public',
      emptyOutDir: false,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:3100',
        '/locales': 'http://localhost:3100',
      },
    },
  };
});
