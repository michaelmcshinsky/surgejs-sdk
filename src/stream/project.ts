/**
 * What goes into a project, decided once for every client: single-file
 * rules, the ignore filter (Surge defaults + `.surgeignore`), and the
 * relative references of an HTML page.
 *
 * No fs and no Buffer — stream/publish.ts supplies the file system around
 * it. Ported from the official surge-stream project.js.
 */

import ignore from 'ignore'

/** The ignore manager type produced by the `ignore` package. */
export type IgnoreManager = ReturnType<typeof ignore>

/**
 * Surge's default ignore rules, inlined from the `surge-ignore` package:
 * `.git`, all dotfiles, editor backup files, and dependency directories.
 */
export const DEFAULT_IGNORES: readonly string[] = [
  '.git',
  '.*',
  '*.*~',
  'node_modules',
  'bower_components',
]

/** A project of exactly one file publishes at the root. */
export interface SingleRule {
  as: string
}

export type SingleResult = SingleRule | { refused: string }

/** One row per type; a type without a row is refused before anything uploads. */
const SINGLE: ReadonlyArray<{ test: RegExp; as: string }> = [
  { test: /\.html?$/i, as: 'index.html' },
]

/** Decide how a one-file project publishes: `{ as }` its name at the root, or `{ refused }`. */
export function singleFile(name: string): SingleResult {
  const rule = SINGLE.find((r) => r.test.test(name))
  if (rule) return { as: rule.as }
  return {
    refused: `A project is a directory - put ${name} in a folder and publish the folder.`,
  }
}

/** The ignore filter: Surge's defaults, plus a project's `.surgeignore` text when it has one. */
export function createIgnorer(surgeignoreText?: string | null): IgnoreManager {
  const ig = ignore().add([...DEFAULT_IGNORES])
  if (surgeignoreText) ig.add(surgeignoreText)
  return ig
}

/**
 * Relative `src`/`href` paths in a page — the files it uses that publishing
 * it alone would leave behind. Relative to the page's folder, without query
 * or fragment, decoded, deduplicated, at most 200 (callers keep the ones
 * that exist). `/x` counts: it names the domain's root. Anything with a
 * scheme, or protocol-relative (`//host/x`), points elsewhere.
 */
export function htmlReferences(html: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const re = /\b(?:src|href)\s*=\s*["']([^"'#?]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null && out.length < 200) {
    /* v8 ignore next: the capture group is + -quantified, so it is always
       present on a match; the fallback keeps noUncheckedIndexedAccess happy */
    let ref = (m[1] ?? '').trim()
    if (!ref || /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) continue
    try {
      ref = decodeURIComponent(ref)
    } catch {
      // keep the undecoded form when it isn't valid percent-encoding
    }
    ref = ref.replace(/^\/+/, '')
    if (!ref || seen.has(ref)) continue
    seen.add(ref)
    out.push(ref)
  }
  return out
}
