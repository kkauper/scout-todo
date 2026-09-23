import { defineConfig } from 'vitest/config'

// Vite reserves `process.env.BASE_URL` for its own default ('/') and overwrites it inside test
// workers, so the value passed on the command line is captured here (still config-load time, before
// Vite's own override applies) and relayed under a private key the test file reads instead.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30000,
    fileParallelism: false,
    env: {
      SCOUT_TEST_BASE_URL: process.env.BASE_URL ?? '',
    },
  },
})
