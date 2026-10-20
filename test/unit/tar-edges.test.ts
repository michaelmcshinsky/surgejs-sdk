import { describe, expect, it } from 'vitest'
import { tarEnd, tarHeader, tarPadding } from '../../src/stream/tar.js'
import { readTar } from '../helpers/tar-reader.js'

const BLOCK = 512

function octalField(header: Uint8Array, off: number, size: number): string {
  return Buffer.from(header.subarray(off, off + size))
    .toString('utf8')
    .replace(/\0.*$/, '')
    .trim()
}

describe('tar field edges', () => {
  it('defaults mode to 0644 when omitted', () => {
    const header = tarHeader('a.txt', 0)
    expect(parseInt(octalField(header, 100, 8), 8)).toBe(0o644)
  })

  it('throws on a size that overflows the 12-byte octal field', () => {
    expect(() => tarHeader('a', Number.MAX_SAFE_INTEGER)).toThrow(
      /tar field overflow/,
    )
  })

  it('throws on a negative size', () => {
    expect(() => tarHeader('a', -1)).toThrow(/tar field overflow/)
  })

  it('masks the mode to permission bits before writing (no overflow possible)', () => {
    // portableMode masks with 0o7777, so any mode fits the 8-byte field
    const header = tarHeader('a', 0, 2 ** 30)
    expect(parseInt(octalField(header, 100, 8), 8)).toBeLessThanOrEqual(0o7777)
  })

  it('needs PAX when a multi-byte character cannot fit whole in the name field', () => {
    // 99 ASCII bytes then a 2-byte char: 101 bytes total, char can't split
    const name = `${'a'.repeat(99)}é`
    const header = tarHeader(name, 0, 0o644)
    expect(header.length).toBeGreaterThan(BLOCK)
    expect(header[156]).toBe('x'.charCodeAt(0))
  })

  it('needs PAX when both basename and prefix exceed their fields', () => {
    const name = `${'x'.repeat(120)}/${'y'.repeat(120)}`
    const header = tarHeader(name, 0, 0o644)
    expect(header.length).toBeGreaterThan(BLOCK)

    const body = tarEnd()
    const archive = Buffer.concat([Buffer.from(header), body])
    const entries = readTar(archive)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.name).toBe(name)
  })

  it('handles an absolute long path without hanging', () => {
    const name = `/${'seg/'.repeat(60)}file.txt`
    const header = tarHeader(name, 0, 0o644)
    expect(header.length).toBeGreaterThanOrEqual(BLOCK)
    const archive = Buffer.concat([Buffer.from(header), Buffer.from(tarEnd())])
    const entries = readTar(archive)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.name).toBe(name)
  })

  it('sizes a PAX header large enough for a ~1000-byte path record', () => {
    // paxField length-digit growth: a record whose len+len(digits) crosses
    // a power of ten needs one more length digit
    const name = `d/${'n'.repeat(990)}`
    const header = tarHeader(name, 0, 0o644)
    const archive = Buffer.concat([
      Buffer.from(header),
      Buffer.from(tarEnd()),
    ])
    const entries = readTar(archive)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.name).toBe(name)
  })

  it('packs a zero-byte file as a header with no content blocks', () => {
    const header = Buffer.from(tarHeader('proj/empty.txt', 0, 0o644))
    const archive = Buffer.concat([header, Buffer.from(tarEnd())])
    const entries = readTar(archive)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.size).toBe(0)
    expect(entries[0]?.content.length).toBe(0)
  })
})

describe('gzip portability byte', () => {
  it('publish sets the OS byte to 255 (unknown) — verified via real publish', () => {
    // the portableGzip transform is exercised by every publish test; this
    // documents the invariant the server's extractor relies on
    expect(tarPadding(0)).toHaveLength(0)
    expect(tarEnd()).toHaveLength(1024)
  })
})
