import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { isValidDomain } from './platform.js'

/**
 * CNAME helpers — the convention Surge shares with GitHub Pages.
 *
 * A project remembers its domain in a `CNAME` file at its root; the CLI
 * writes one after the first publish (never overwriting) and every command
 * resolves its target from it. Tools built on this SDK get the same
 * behavior here.
 */

/** What `readCname` found, and where it found it. */
export interface CnameResult {
  domain: string
  source: 'cname' | 'package.json'
}

/**
 * Read a project's domain: the `CNAME` file wins, then a `surge.domain`
 * field in `package.json` — the same precedence the CLI uses. Returns null
 * when the directory declares no domain.
 */
export function readCname(dir: string): CnameResult | null {
  try {
    const text = readFileSync(join(dir, 'CNAME'), 'utf8')
    /* v8 ignore next: split always yields at least one element */
    const first = text.split(/\r?\n/)[0]?.trim() ?? ''
    if (first && isValidDomain(first)) return { domain: first, source: 'cname' }
  } catch {
    // no CNAME file — fall through to package.json
  }
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      surge?: { domain?: unknown }
    }
    const domain = pkg.surge?.domain
    if (typeof domain === 'string' && isValidDomain(domain)) {
      return { domain, source: 'package.json' }
    }
  } catch {
    // no package.json, or unparseable — declare no domain
  }
  return null
}

/**
 * Write the project's domain into `CNAME` — but never overwrite an existing
 * file (matching the CLI: the first publish records the domain; later
 * publishes keep it). Returns true when the file was written.
 */
export function writeCname(dir: string, domain: string): boolean {
  if (!isValidDomain(domain)) {
    throw new TypeError(`not a valid domain: ${domain}`)
  }
  const file = join(dir, 'CNAME')
  if (existsSync(file)) return false
  writeFileSync(file, `${domain}\n`)
  return true
}
