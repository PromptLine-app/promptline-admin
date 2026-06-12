import { defineConfig } from 'vitest/config';
import path from 'path';

// Standalone test config (does not load the app's dev-only API plugin from
// vite.config.ts). jsdom gives us window/document for the theme + DOM helpers.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
