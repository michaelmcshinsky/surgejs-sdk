import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

/** A temp directory that cleans itself up. */
export class TempProject {
  readonly path: string

  constructor(prefix = 'surgejs-sdk-') {
    this.path = mkdtempSync(join(tmpdir(), prefix))
  }

  file(relPath: string, content: string | Buffer): this {
    const full = join(this.path, relPath)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
    return this
  }

  /** A file of exactly `bytes` bytes with a deterministic fill. */
  bigFile(relPath: string, bytes: number): this {
    const buf = Buffer.alloc(bytes)
    for (let i = 0; i < bytes; i++) buf[i] = i % 251
    return this.file(relPath, buf)
  }

  cleanup(): void {
    rmSync(this.path, { recursive: true, force: true })
  }
}

/** Gunzip a buffer. */
export function gunzip(buf: Buffer): Buffer {
  return gunzipSync(buf)
}
