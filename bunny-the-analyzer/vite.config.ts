import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // NOTE: the Gemini API key is intentionally NOT exposed to the client.
      // It lives only on the server, in the GEMINI_API_KEY env var used by
      // api/analyze.ts. The browser calls /api/analyze, never Gemini directly.
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
