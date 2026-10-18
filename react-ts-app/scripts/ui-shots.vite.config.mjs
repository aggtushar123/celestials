// Vite for screenshot runs (UI foundations spec §9.3), on any port. The
// API's CORS list names only :5173 and :5174, so this server proxies the
// API and its sockets and the app talks to them on its own origin. Start:
//   VITE_API_URL= npx vite --config scripts/ui-shots.vite.config.mjs --port 5175
// (the empty VITE_API_URL wins over .env, so the app uses its own origin).
import { defineConfig, mergeConfig } from 'vite';
import base from '../vite.config.ts';

export default mergeConfig(
  base,
  defineConfig({
    server: {
      strictPort: true,
      proxy: {
        '/api': 'http://localhost:8000',
        '/ws': { target: 'ws://localhost:8000', ws: true },
      },
    },
  }),
);
