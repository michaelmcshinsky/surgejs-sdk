/**
 * The upload archive format, and only the writing half of it: regular files
 * in a USTAR tar archive.
 *
 * This is a faithful TypeScript port of `surge-stream`'s pack.js, which
 * writes exactly what node-tar 7 wrote for the official clients
 * (`tar.c({ portable: true, mtime: new Date(0) })`): the same USTAR header
 * fields, the same prefix split for long paths, the same PAX header when a
 * path doesn't fit or isn't ASCII, the same padding and end blocks. The
 * Surge server unpacks with the first path segment stripped, so entries are
 * packed under the project directory's name (`dirname/index.html`).
 *
 * No fs and no Buffer — the same code runs in Node and in a browser.
 */

const BLOCK = 512

const encoder = new TextEncoder()
const utf8 = (str: string): Uint8Array => encoder.encode(str)
const byteLength = (str: string): number => utf8(str).length

/** The largest number a null-terminated octal field holds, by width. */
const MAXNUM: Record<number, number> = { 12: 8589934591, 8: 2097151 }

/** node-tar's octal: zero-padded, then a space and a NUL — except a number that already fills the field, which gets only the NUL. */
function octal(num: number, size: number): string {
  const str = Math.floor(num).toString(8)
  /* v8 ignore next: a 512-byte header's checksum (max ~130560 = 6 digits)
     never fills a 7-digit slot; file sizes reaching it would need a 1 GB
     entry, which the platform's 450 MB limit forbids */
  if (str.length === size - 1) return `${str}\0`
  // size - str.length - 2 zeros, then the digits, then " \0" — exactly size bytes
  // (Array(k).join yields k-1 separators, which is what node-tar relied on)
  return `${'0'.repeat(size - str.length - 2)}${str} \0`
}

function writeAscii(buf: Uint8Array, off: number, str: string): void {
  for (let i = 0; i < str.length; i++) buf[off + i] = str.charCodeAt(i)
}

/** A string into a fixed field, whole characters only, NUL-padded. True when it couldn't be stored faithfully: too long, or not ASCII. */
function writeString(
  buf: Uint8Array,
  off: number,
  size: number,
  str: string | undefined,
): boolean {
  if (str === undefined) return false
  let at = 0
  for (const ch of str) {
    const bytes = utf8(ch)
    if (at + bytes.length > size) break
    buf.set(bytes, off + at)
    at += bytes.length
  }
  return str.length !== byteLength(str) || str.length > size
}

function writeNumber(
  buf: Uint8Array,
  off: number,
  size: number,
  num: number | undefined,
): boolean {
  /* v8 ignore start: every call site passes a known width (8 or 12) and a
     defined number — these guards protect future call sites, not today's */
  if (num === undefined) return false
  const max = MAXNUM[size]
  if (max === undefined) throw new Error(`tar field width ${size} unsupported`)
  /* v8 ignore stop */
  if (num > max || num < 0) throw new Error(`tar field overflow: ${num}`)
  writeAscii(buf, off, octal(num, size))
  return false
}

// posix path helpers, as node-tar uses them
function tarDirname(p: string): string {
  const i = p.lastIndexOf('/')
  if (i === -1) return '.'
  if (i === 0) return '/'
  return p.slice(0, i)
}

function tarBasename(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1)
}

function tarJoin(a: string, b: string): string {
  return a === '.' ? b : `${a}/${b}`
}

/** A path that's too long for the 100-byte name field moves its leading directories into the 155-byte prefix field. Returns [name, prefix, needsPax]. */
function splitPrefix(p: string): [string, string, boolean] {
  const size = 100
  const prefixSize = 155
  if (byteLength(p) < size) return [p, '', false]
  let name = tarBasename(p)
  let prefix = tarDirname(p)
  const root = p.charAt(0) === '/' ? '/' : '.'
  for (;;) {
    if (byteLength(name) <= size && byteLength(prefix) <= prefixSize) {
      return [name, prefix, false]
    }
    if (byteLength(name) > size && byteLength(prefix) <= prefixSize) {
      return [name.slice(0, size - 1), prefix, true]
    }
    name = tarJoin(tarDirname(prefix), name)
    prefix = tarDirname(prefix)
    if (prefix === root) break
  }
  return [p.slice(0, size - 1), '', true]
}

interface TarFields {
  path: string
  mode?: number
  size?: number
  type: string
  uname?: string
  gname?: string
  devmaj?: number
  devmin?: number
  linkpath?: string
}

/** Encode one 512-byte header block. True when a PAX header has to carry what didn't fit. */
function encode(buf: Uint8Array, off: number, f: TarFields): boolean {
  const [name, prefix, splitNeedsPax] = splitPrefix(f.path)
  let needPax = splitNeedsPax
  needPax = writeString(buf, off, 100, name) || needPax
  needPax = writeNumber(buf, off + 100, 8, f.mode) || needPax
  needPax = writeNumber(buf, off + 124, 12, f.size) || needPax
  needPax = writeNumber(buf, off + 136, 12, 0) || needPax
  buf[off + 156] = f.type.charCodeAt(0)
  needPax = writeString(buf, off + 157, 100, f.linkpath) || needPax
  writeAscii(buf, off + 257, 'ustar\u000000')
  needPax = writeString(buf, off + 265, 32, f.uname) || needPax
  needPax = writeString(buf, off + 297, 32, f.gname) || needPax
  needPax = writeNumber(buf, off + 329, 8, f.devmaj) || needPax
  needPax = writeNumber(buf, off + 337, 8, f.devmin) || needPax
  needPax = writeString(buf, off + 345, 155, prefix) || needPax
  let sum = 8 * 0x20
  // loops stay inside the 512-byte block the fields above just wrote
  for (let i = off; i < off + 148; i++) sum += buf[i]!
  for (let j = off + 156; j < off + BLOCK; j++) sum += buf[j]!
  writeAscii(buf, off + 148, octal(sum, 8))
  return needPax
}

/** "<len> key=value\n", where len counts its own digits. */
function paxField(key: string, value: string | number): string {
  const s = ` ${key}=${value}\n`
  const len = byteLength(s)
  let digits = Math.floor(Math.log(len) / Math.log(10)) + 1
  if (len + digits >= 10 ** digits) digits += 1
  return `${digits + len}${s}`
}

function paxHeader(path: string, size: number): Uint8Array {
  const body = utf8(
    `${paxField('path', path)}${paxField('mtime', 0)}${paxField('size', size)}`,
  )
  // one block for the header plus whole blocks for the body
  // (Math.ceil(1 + len/BLOCK), exactly as node-tar sized it)
  const buf = new Uint8Array(BLOCK * Math.ceil(1 + body.length / BLOCK))
  encode(buf, 0, {
    path: `PaxHeader/${tarBasename(path)}`.slice(0, 99),
    mode: 0o644,
    size: body.length,
    type: 'x',
    linkpath: '',
    uname: '',
    gname: '',
    devmaj: 0,
    devmin: 0,
  })
  buf.set(body, BLOCK)
  return buf
}

/** node-tar's portable mode: permission bits only, owner read/write always, never group/other write. */
function portableMode(mode: number): number {
  return ((mode & 0o7777) | 0o600) & ~0o22
}

/** Bytes before a file's content: a PAX header when needed, then the file's 512-byte header. */
export function tarHeader(path: string, size: number, mode?: number): Uint8Array {
  const block = new Uint8Array(BLOCK)
  const needPax = encode(block, 0, {
    path,
    mode: portableMode(mode === undefined ? 0o644 : mode),
    size,
    type: '0',
    devmaj: 0,
    devmin: 0,
  })
  if (!needPax) return block
  const pax = paxHeader(path, size)
  const out = new Uint8Array(pax.length + BLOCK)
  out.set(pax, 0)
  out.set(block, pax.length)
  return out
}

/** Zeros after the content, to the next 512-byte block boundary. */
export function tarPadding(size: number): Uint8Array {
  return new Uint8Array(((BLOCK - (size % BLOCK)) % BLOCK))
}

/** The two zero blocks that close the archive. */
export function tarEnd(): Uint8Array {
  return new Uint8Array(BLOCK * 2)
}
