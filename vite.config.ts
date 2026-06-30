import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { pathToFileURL } from 'node:url';

/**
 * Dev-only bridge for the Vercel serverless functions under `api/`.
 *
 * In production Vercel runs `api/**` as real functions. The plain Vite dev
 * server doesn't — and `vercel dev` mis-proxies Vite's own dev modules — so we
 * invoke the handlers ourselves here, adapting Node's req/res to the Vercel-style
 * `res.status().json()` the handlers expect. Server-only env (ZOHO_CLIENT_SECRET,
 * SUPABASE_SERVICE_ROLE_KEY, …) is loaded into process.env below so the handler
 * reads it exactly as it would on Vercel.
 */
const devApiRoutes: Record<string, string> = {
  '/api/zoho/session': 'api/zoho/session.js',
  '/api/admin/impersonate': 'api/admin/impersonate.js',
  '/api/admin/team': 'api/admin/team.js',
  '/api/admin/send-followup': 'api/admin/send-followup.js',
};

function devApi(): Plugin {
  return {
    name: 'dev-api-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        const file = devApiRoutes[url];
        if (!file) return next();

        // Collect the raw body; handlers JSON.parse it themselves.
        let raw = '';
        req.setEncoding('utf8');
        for await (const chunk of req) raw += chunk;
        (req as unknown as { body: string }).body = raw;

        // Shim the Vercel-style response helpers onto Node's ServerResponse.
        (res as unknown as { status: (code: number) => typeof res }).status = (code: number) => {
          res.statusCode = code;
          return res;
        };
        (res as unknown as { json: (obj: unknown) => void }).json = (obj: unknown) => {
          if (!res.getHeader('Content-Type')) {
            res.setHeader('Content-Type', 'application/json');
          }
          res.end(JSON.stringify(obj));
        };

        try {
          const mod = await import(
            pathToFileURL(path.resolve(__dirname, file)).href
          );
          await mod.default(req, res);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'dev api error',
            }),
          );
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load ALL env (including non-VITE_ server secrets) and expose to the dev
  // function bridge via process.env, mirroring the Vercel runtime.
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of [
    'ZOHO_CLIENT_ID',
    'ZOHO_CLIENT_SECRET',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
  ]) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [react(), devApi()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5174,
    },
  };
});
