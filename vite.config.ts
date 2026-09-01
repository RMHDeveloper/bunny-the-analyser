import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Dev-only: run the Vercel serverless function (api/analyze.ts) as Vite
 * middleware so `npm run dev` serves the whole app on one port. In production
 * Vercel runs api/analyze.ts itself; this plugin does nothing there.
 */
function devApi(): Plugin {
  return {
    name: 'dev-api-analyze',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/analyze', async (req, res) => {
        try {
          const { default: handler } = await server.ssrLoadModule('/api/analyze.ts');
          let body = '';
          for await (const chunk of req) body += chunk;
          const request = {
            method: req.method,
            headers: req.headers,
            socket: req.socket,
            body: body ? JSON.parse(body) : {},
          };
          const response = {
            _status: 200,
            status(code: number) { this._status = code; return this; },
            setHeader(key: string, value: string) { res.setHeader(key, value); return this; },
            json(obj: unknown) {
              res.statusCode = this._status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(obj));
              return this;
            },
          };
          await handler(request, response);
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // Load server-side env vars from .env.local into the dev server process only.
  // They are used server-side by the middleware above and never sent to the
  // client (no `define`, no VITE_ prefix).
  if (command === 'serve') {
    const env = loadEnv(mode, '.', '');
    const serverKeys = [
      'GEMINI_API_KEY',
      'GEMINI_MODEL',
      'OPENROUTER_API_KEY',
      'OPENROUTER_MODEL',
      'ALLOWED_ORIGINS',
    ];
    for (const key of serverKeys) {
      if (env[key] && !process.env[key]) process.env[key] = env[key];
    }
  }

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), tailwindcss(), devApi()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
