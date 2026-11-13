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
      exclude: [
        'src/types/**',
        'src/version.ts',
        // the executable shim: shebang plus one call into cli/run.ts
        'src/cli/index.ts',
      ],
      reporter: ['text-summary', 'json-summary', 'html'],
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
