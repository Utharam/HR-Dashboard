import { defineConfig } from 'vitest/config'

// Environment routing is driven by file EXTENSION, not by the __tests__ directory:
// every *.test.ts gets node, every *.test.tsx gets jsdom. The include globs are
// deliberately broad so that a test file placed anywhere under src/ is collected.
// A narrower glob (e.g. src/**\/__tests__\/**\/*.test.ts) would silently drop a
// misplaced test file instead of failing loudly, which is far worse.
const exclude = ['**/fixtures/**', '**/__mocks__/**', '**/node_modules/**']

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          globals: false,
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude,
          setupFiles: ['./src/test-setup.ts'],
        },
      },
      {
        test: {
          name: 'dom',
          globals: false,
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          exclude,
          setupFiles: ['./src/test-setup.ts'],
        },
      },
    ],
  },
})
