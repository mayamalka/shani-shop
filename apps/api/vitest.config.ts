import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // integration files share one test database → run files one after another
    fileParallelism: false,
    projects: [
      { test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' } },
      {
        test: {
          name: 'integration',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
