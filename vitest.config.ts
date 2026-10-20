import { defineConfig } from 'vitest/config'

const config = defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // type-only modules emit no runtime code; version.ts is asserted
      // against package.json by its own test but is a one-line constant
      exclude: ['src/types/**', 'src/version.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: {
        lines: 98,
        functions: 98,
        branches: 96,
        statements: 98,
      },
    },
  },
})

export default config
