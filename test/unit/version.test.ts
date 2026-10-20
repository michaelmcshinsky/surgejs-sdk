import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SDK_VERSION } from '../../src/version.js'

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../../package.json')

describe('SDK_VERSION', () => {
  it('matches package.json', () => {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }
    expect(SDK_VERSION).toBe(pkg.version)
  })
})
