import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Component/interaction tests only (`*.test.tsx`, run with `npm run test:ui`).
 * `lib/*.test.ts` stays on Node's built-in test runner via `npm test` --
 * separate glob, separate tool, so neither accidentally picks up the other's
 * files.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.tsx'],
    exclude: ['node_modules', '.next'],
  },
  resolve: {
    alias: {
      '@': import.meta.dirname,
    },
  },
});
