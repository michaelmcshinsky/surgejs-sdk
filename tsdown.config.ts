import { defineConfig } from 'tsdown'

const config = defineConfig({
  entry: ['src/index.ts', 'src/stream/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  target: 'node18',
  platform: 'node',
  fixedExtension: false,
  clean: true,
})

export default config
