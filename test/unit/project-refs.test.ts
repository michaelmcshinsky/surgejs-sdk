import { describe, expect, it } from 'vitest'
import { htmlReferences } from '../../src/stream/project.js'

describe('htmlReferences edges', () => {
  it('keeps an undecodable percent-sequence as-is', () => {
    // %E0%A4%A is truncated UTF-8 — decodeURIComponent throws, we keep raw
    expect(htmlReferences('<img src="img/bad%E0%A4%A">')).toEqual([
      'img/bad%E0%A4%A',
    ])
  })

  it('handles unquoted attribute values (skipped by the matcher)', () => {
    expect(htmlReferences('<img src=img/x.png>')).toEqual([])
  })

  it('returns empty for non-string-like input', () => {
    expect(htmlReferences('')).toEqual([])
    expect(htmlReferences('<p>no assets</p>')).toEqual([])
  })

  it('accepts uppercase attribute names', () => {
    expect(htmlReferences('<IMG SRC="a.png" HREF="b.html">')).toEqual([
      'a.png',
      'b.html',
    ])
  })

  it('strips a root-relative path down to its name', () => {
    expect(htmlReferences('<a href="/deep/path/page.html">x</a>')).toEqual([
      'deep/path/page.html',
    ])
  })
})
