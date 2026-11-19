import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const actionYml = readFileSync(join(root, 'action.yml'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }

// Minimal x.y.z comparator -- enough to prove the action's default install
// range can resolve to a version that actually exists.
const parseVersion = (v: string): [number, number, number] => {
  const [major = 0, minor = 0, patch = 0] = v.split('.').map(Number)
  return [major, minor, patch]
}
const cmp = (a: string, b: string): number => {
  const [aMaj, aMin, aPat] = parseVersion(a)
  const [bMaj, bMin, bPat] = parseVersion(b)
  return aMaj - bMaj || aMin - bMin || aPat - bPat
}

describe('action.yml', () => {
  it('default SDK version range resolves to an existing release', () => {
    // Regression: the default was "^1.1.0" while package.json was 1.0.1 and
    // npm only had <=1.0.0 -- `npm install -g surgejs-sdk@^1.1.0` failed with
    // ETARGET, and the action ships inside the package it installs.
    const match = actionYml.match(/version:\n(?:.*\n)*?\s+default: "([^"]+)"/)
    const range = match?.[1]
    if (!range) throw new Error('version input default not found in action.yml')

    const base = range.replace(/^[\^~>=<\s]+/, '')
    expect(cmp(base, pkg.version), `default range ${range} requires > ${pkg.version}`).toBeLessThanOrEqual(0)
  })

  it('installs Node 22 before the global CLI install', () => {
    // package.json engines requires node >=22.18; runner default node may be older.
    expect(actionYml).toContain('actions/setup-node@')
    expect(actionYml).toMatch(/node-version:\s*22/)
    const setupIdx = actionYml.indexOf('actions/setup-node@')
    const installIdx = actionYml.indexOf('npm install --global')
    expect(setupIdx).toBeGreaterThanOrEqual(0)
    expect(installIdx).toBeGreaterThan(setupIdx)
  })
})
