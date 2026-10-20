import { describe, expect, it } from 'vitest'
import { tarEnd, tarHeader, tarPadding } from '../../src/stream/tar.js'
import { readTar } from '../helpers/tar-reader.js'

const BLOCK = 512

describe('tarHeader', () => {
  it('produces a 512-byte USTAR header with the right fields', () => {
    const header = tarHeader('site/index.html', 15, 0o644)
    expect(header.length).toBe(BLOCK)

    const name = Buffer.from(header.subarray(0, 100)).toString('utf8').replace(/\0.*$/, '')
    expect(name).toBe('site/index.html')

    // ustar magic at offset 257: "ustar" then NUL then "00"
    const magic = Buffer.from(header.subarray(257, 262)).toString('utf8')
    expect(magic).toBe('ustar')

    // portable mode: 0644 stays 0644 (no group/other write to clear)
    const mode = parseInt(
      Buffer.from(header.subarray(100, 108)).toString('utf8').replace(/\0.*$/, '').trim(),
      8,
    )
    expect(mode).toBe(0o644)

    const size = parseInt(
      Buffer.from(header.subarray(124, 136)).toString('utf8').replace(/\0.*$/, '').trim(),
      8,
    )
    expect(size).toBe(15)

    // type flag: regular file
    expect(header[156]).toBe('0'.charCodeAt(0))
  })

  it('clears group/other write bits (portable mode)', () => {
    const header = tarHeader('f', 0, 0o777)
    const mode = parseInt(
      Buffer.from(header.subarray(100, 108)).toString('utf8').replace(/\0.*$/, '').trim(),
      8,
    )
    expect(mode).toBe(0o755)
  })

  it('sets a valid checksum', () => {
    const header = tarHeader('site/a.txt', 3, 0o644)
    const stored = parseInt(
      Buffer.from(header.subarray(148, 156)).toString('utf8').replace(/\0.*$/, '').trim(),
      8,
    )
    let sum = 8 * 0x20
    for (let i = 0; i < BLOCK; i++) {
      if (i >= 148 && i < 156) continue
      sum += header[i] ?? 0
    }
    expect(stored).toBe(sum)
  })

  it('emits a PAX header when the basename alone exceeds 100 bytes', () => {
    const longName = `site/${'a'.repeat(120)}.html`
    expect(longName.length).toBeGreaterThan(100)
    const header = tarHeader(longName, 5, 0o644)
    // PAX header block then the real header
    expect(header.length).toBeGreaterThan(BLOCK)
    expect(header[156]).toBe('x'.charCodeAt(0))

    // round-trips through the reader: the full path survives
    const body = Buffer.from('hello')
    const archive = Buffer.concat([
      header,
      body,
      tarPadding(5),
      Buffer.from(tarEnd()),
    ])
    const entries = readTar(archive)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.name).toBe(longName)
    expect(entries[0]?.content.toString()).toBe('hello')
  })

  it('uses the prefix field (no PAX) when leading directories carry the length', () => {
    const longName = `site/${'nested/'.repeat(20)}index.html`
    expect(longName.length).toBeGreaterThan(100)
    const header = tarHeader(longName, 5, 0o644)
    // fits via the 155-byte prefix field: a single 512-byte header
    expect(header.length).toBe(BLOCK)
    expect(header[156]).toBe('0'.charCodeAt(0))

    const body = Buffer.from('hello')
    const archive = Buffer.concat([
      header,
      body,
      tarPadding(5),
      Buffer.from(tarEnd()),
    ])
    const entries = readTar(archive)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.name).toBe(longName)
  })
})

describe('tarPadding', () => {
  it('pads to the next block boundary', () => {
    expect(tarPadding(0).length).toBe(0)
    expect(tarPadding(1).length).toBe(511)
    expect(tarPadding(512).length).toBe(0)
    expect(tarPadding(513).length).toBe(511)
  })
})

describe('tarEnd', () => {
  it('is two zero blocks', () => {
    const end = tarEnd()
    expect(end.length).toBe(1024)
    expect(end.every((b) => b === 0)).toBe(true)
  })
})

describe('tar round-trip', () => {
  it('packs a file so the reader recovers name, size, and content', () => {
    const content = Buffer.from('Hello, Surge!\n')
    const header = Buffer.from(tarHeader('proj/index.html', content.length, 0o644))
    const archive = Buffer.concat([
      header,
      content,
      tarPadding(content.length),
      tarEnd(),
    ])
    const entries = readTar(archive)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.name).toBe('proj/index.html')
    expect(entries[0]?.size).toBe(content.length)
    expect(entries[0]?.content.toString()).toBe('Hello, Surge!\n')
  })
})
