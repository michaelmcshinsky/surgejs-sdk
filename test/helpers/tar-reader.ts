/**
 * Minimal USTAR tar reader for tests: parse the archive our packer produces
 * and assert on entry names, contents, and header fields.
 */

export interface TarEntry {
  name: string
  size: number
  mode: number
  type: string
  content: Buffer
}

const BLOCK = 512

function readString(buf: Buffer, off: number, size: number): string {
  const slice = buf.subarray(off, off + size)
  const end = slice.indexOf(0)
  return slice.toString('utf8', 0, end === -1 ? slice.length : end)
}

function readOctal(buf: Buffer, off: number, size: number): number {
  const str = readString(buf, off, size).trim()
  if (!str) return 0
  return parseInt(str, 8)
}

/** Parse a PAX extended-header body into its key/value records. */
function parsePax(body: Buffer): Record<string, string> {
  const out: Record<string, string> = {}
  let off = 0
  while (off < body.length) {
    const space = body.indexOf(0x20, off)
    if (space === -1) break
    const len = parseInt(body.subarray(off, space).toString('utf8'), 10)
    if (!Number.isFinite(len) || len <= 0) break
    const record = body.subarray(space + 1, off + len).toString('utf8').trimEnd()
    const eq = record.indexOf('=')
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1)
    off += len
  }
  return out
}

/** Parse a (decompressed) tar buffer into its file entries. */
export function readTar(buf: Buffer): TarEntry[] {
  const entries: TarEntry[] = []
  let off = 0
  let pendingPax: Record<string, string> | null = null
  while (off + BLOCK <= buf.length) {
    const header = buf.subarray(off, off + BLOCK)
    // two zero blocks close the archive
    if (header.every((b) => b === 0)) break
    let name = readString(header, 0, 100)
    const mode = readOctal(header, 100, 8)
    const size = readOctal(header, 124, 12)
    const type = String.fromCharCode(header[156] ?? 0)
    // the magic field is "ustar" then a NUL then "00"; readString stops at NUL
    const magic = readString(header, 257, 8)
    const prefix = readString(header, 345, 155)

    if (!magic.startsWith('ustar')) {
      throw new Error(`bad ustar magic at ${off}: ${JSON.stringify(magic)}`)
    }

    off += BLOCK

    let fromPax = false
    if (type === 'x') {
      // PAX extended header: its records override the next header's fields
      pendingPax = parsePax(buf.subarray(off, off + size))
      off += size + ((BLOCK - (size % BLOCK)) % BLOCK)
      continue
    }

    if (pendingPax?.['path']) {
      // the PAX path is the complete path — no prefix split to rejoin
      name = pendingPax['path']
      fromPax = true
    }
    pendingPax = null

    const content = buf.subarray(off, off + size)
    off += size + ((BLOCK - (size % BLOCK)) % BLOCK)

    if (type === '0' || type === String.fromCharCode(0)) {
      entries.push({
        name: !fromPax && prefix ? `${prefix}/${name}` : name,
        size,
        mode,
        type: '0',
        content: Buffer.from(content),
      })
    }
  }
  return entries
}
