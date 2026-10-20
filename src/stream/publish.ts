import { createReadStream, stat as fsStat } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  readdirSync,
  lstatSync,
  statSync,
  realpathSync,
  readFileSync,
  existsSync,
  readFile,
} from 'node:fs'
import {
  join as pathJoin,
  basename as pathBasename,
  dirname as pathDirname,
  resolve as pathResolve,
} from 'node:path'
import { Readable, Transform, pipeline } from 'node:stream'
import { createGzip } from 'node:zlib'
import type { BasicAuth, Credentials } from '../types/primitives.js'
import type {
  ProjectEntry,
  ProjectPlan,
  PublishOptions,
  SingleFileInfo,
} from '../types/stream.js'
import { toBasicAuth } from '../core/credentials.js'
import { request } from '../core/request.js'
import { limitViolation } from '../platform.js'
import { handshake } from './handshake.js'
import { StreamHandle } from './handle.js'
import { createIgnorer, htmlReferences, singleFile } from './project.js'
import { tarEnd, tarHeader, tarPadding } from './tar.js'

// ── project scanning ────────────────────────────────────────────────────────

/**
 * Recursively collect every file in a directory, respecting ignore rules.
 *
 * Symlinks are resolved client side and packed as the content they point at,
 * so the server only ever receives regular files. A link that resolves to
 * nothing (dangling, or back to an ancestor) is skipped and reported rather
 * than crashing the publish. `ancestors` holds the real path of every
 * directory above this one, root first, so a link back up the tree is caught
 * before it recurses.
 */
function getFiles(
  dir: string,
  ig: ReturnType<typeof createIgnorer>,
  prefix: string,
  ancestors: string[],
  skipped: string[],
): string[] {
  const results: string[] = []
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = pathJoin(dir, entry)
    const relativePath = prefix ? `${prefix}/${entry}` : entry
    let stat = lstatSync(fullPath)
    const isLink = stat.isSymbolicLink()
    if (isLink) {
      try {
        stat = statSync(fullPath)
      } catch {
        // dangling, or a chain of links that never ends (ELOOP)
        if (!ig.ignores(relativePath)) skipped.push(relativePath)
        continue
      }
    }
    if (stat.isDirectory()) {
      if (ig.ignores(`${relativePath}/`)) continue
      const realPath = isLink
        ? realpathSync.native(fullPath)
        : /* v8 ignore next: ancestors always holds the root when recursing */
          pathJoin(ancestors[ancestors.length - 1] ?? '', entry)
      if (ancestors.includes(realPath)) {
        skipped.push(relativePath)
        continue
      }
      results.push(
        ...getFiles(fullPath, ig, relativePath, [...ancestors, realPath], skipped),
      )
    } else if (stat.isFile()) {
      if (!ig.ignores(relativePath)) results.push(relativePath)
      /* v8 ignore start 2: fifos cannot be created on Windows — the
         "skips a fifo" integration test exercises this on POSIX/CI */
    } else if (!ig.ignores(relativePath)) {
      // fifos, sockets and devices have no content, and a fifo hangs tar
      skipped.push(relativePath)
    }
    /* v8 ignore stop */
  }
  return results
}

/**
 * The files a page uses that exist next to it on disk: publishing the page
 * alone leaves them behind, so they ride along as a client-side hint.
 */
function localReferences(file: string): string[] {
  let html: string
  try {
    html = readFileSync(file, 'utf8').slice(0, 2 * 1024 * 1024)
  } catch {
    /* v8 ignore next: the file was just stat'd as readable; this guards a
       mid-publish removal */
    return []
  }
  const dir = pathDirname(file)
  return htmlReferences(html)
    .filter((ref) => {
      try {
        return statSync(pathJoin(dir, ref)).isFile()
      } catch {
        return false
      }
    })
    .slice(0, 20)
}

function singleFileInfo(file: string): SingleFileInfo {
  const name = pathBasename(file)
  return {
    file: name,
    as: name,
    local: localReferences(file),
  }
}

/** What a project is made of: entries, dirName, skipped, plus single or refused. */
export function createProject(projectPath: string): ProjectPlan {
  const absolute = pathResolve(projectPath)
  if (statSync(absolute).isFile()) {
    const name = pathBasename(absolute)
    const rule = singleFile(name)
    if ('refused' in rule) {
      return { entries: [], dirName: '', skipped: [], refused: rule.refused }
    }
    const single = singleFileInfo(absolute)
    single.as = rule.as
    return {
      entries: [{ name: rule.as, full: absolute }],
      dirName: name.replace(/\.[^.]*$/, '') || 'project',
      skipped: [],
      single,
    }
  }

  const surgeignorePath = pathJoin(absolute, '.surgeignore')
  const ig = createIgnorer(
    existsSync(surgeignorePath) ? readFileSync(surgeignorePath, 'utf8') : null,
  )

  // the directory's name prefixes every entry: "dirname/file.txt"
  const dirName = pathBasename(absolute)
  const skipped: string[] = []
  const files = getFiles(absolute, ig, '', [realpathSync.native(absolute)], skipped)
  const entries: ProjectEntry[] = files.map((f) => ({
    name: f,
    full: pathJoin(absolute, f),
  }))
  return { entries, dirName, skipped }
}

// ── tar stream ──────────────────────────────────────────────────────────────

/** A small file's content, exactly stat.size bytes: a file that grew since the stat goes as it was, one that shrank can't be framed. */
function readSmall(
  full: string,
  f: string,
  size: number,
  cb: (err: Error | null, data?: Buffer) => void,
): void {
  readFile(full, (err, data) => {
    if (err) return cb(err)
    /* v8 ignore start: the shrink race is guarded exactly like the official
       client's — a file changing mid-publish cannot be simulated without
       injecting the filesystem */
    if (data.length < size) {
      return cb(new Error(`file shrank during publish: ${f}`))
    }
    /* v8 ignore stop */
    // subarray is a no-op view at the exact stat'd size
    cb(null, data.subarray(0, size))
  })
}

/** Async fs.stat reduced to the two fields the tar header needs. */
function statEntry(
  full: string,
  cb: (err: Error | null, entryStat?: { size: number; mode: number }) => void,
): void {
  fsStat(full, (err, s) => {
    if (err) return cb(err)
    cb(null, { size: s.size, mode: s.mode })
  })
}

/**
 * The archive as a Readable stream: each file's header, its content read as
 * the upload drains, its padding, then the end blocks. A bounded look-ahead
 * stats (and small-reads) the next files while the current one goes out, so
 * a project of thousands of small files isn't one round trip per file.
 */
function tarStream(dirName: string, entries: ProjectEntry[]): Readable {
  const AHEAD = 8
  const SMALL = 1024 * 1024
  const CHUNK = 1024 * 1024

  type Slot = {
    err?: Error
    stat?: { size: number; mode: number }
    data?: Buffer | null
    ready: boolean
    waiting?: (() => void) | null
  }

  const slots: Array<Slot | undefined> = []
  let started = 0
  let current = 0
  let reading: ReturnType<typeof createReadStream> | null = null
  let busy = false
  let done = false

  const out = new Readable({
    highWaterMark: CHUNK,
    read(): void {
      if (reading) {
        reading.resume()
        return
      }
      if (!busy && !done) next()
    },
  })

  function prefetch(): void {
    while (started < entries.length && started - current < AHEAD) {
      const i = started++
      const entry = entries[i]!
      const slot: Slot = { ready: false, waiting: null }
      slots[i] = slot
      const finish = (
        err?: Error | null,
        entryStat?: { size: number; mode: number },
        data?: Buffer | null,
      ): void => {
        slot.err = err ?? undefined
        slot.stat = entryStat
        slot.data = data
        slot.ready = true
        if (slot.waiting) {
          const w = slot.waiting
          slot.waiting = null
          w()
        }
      }
      statEntry(entry.full, (err, entryStat) => {
        if (err) return finish(err)
        const st = entryStat as { size: number; mode: number }
        if (st.size === 0 || st.size > SMALL) return finish(null, st, null)
        readSmall(entry.full, entry.name, st.size, (readErr, data) =>
          finish(readErr, st, data ?? null),
        )
      })
    }
  }

  function next(): void {
    if (current >= entries.length) {
      done = true
      out.push(Buffer.from(tarEnd()))
      out.push(null)
      return
    }
    prefetch()
    const i = current
    const slot = slots[i]
    /* v8 ignore start: internal invariant — the index walked here is always
       prefetched above; this guards a future regression, not live input */
    if (!slot) {
      done = true
      out.push(Buffer.from(tarEnd()))
      out.push(null)
      return
    }
    /* v8 ignore stop */
    if (!slot.ready) {
      busy = true
      slot.waiting = () => {
        busy = false
        emit(i)
      }
      return
    }
    emit(i)
  }

  function emit(i: number): void {
    const slot = slots[i]!
    const entry = entries[i]!
    slots[i] = undefined
    current = i + 1
    if (slot.err) {
      out.destroy(slot.err)
      return
    }
    const size = slot.stat!.size
    out.push(Buffer.from(tarHeader(`${dirName}/${entry.name}`, size, slot.stat!.mode)))
    if (size === 0) {
      next()
      return
    }
    if (slot.data) {
      out.push(slot.data)
      if (out.push(Buffer.from(tarPadding(size)))) next()
      return
    }
    // a large file streams, read for exactly its stated size
    let sent = 0
    reading = createReadStream(entry.full, {
      start: 0,
      end: size - 1,
      highWaterMark: CHUNK,
    })
    reading.on('data', (chunk: Buffer | string) => {
      // fs streams without an encoding option always yield Buffers
      const buf = chunk as Buffer
      sent += buf.length
      if (!out.push(buf)) reading?.pause()
    })
    /* v8 ignore next 2: mid-stream read failure — the file was stat'd
       moments earlier; guarding a race that needs fs injection to test */
    reading.on('error', (err) => out.destroy(err))
    reading.on('end', () => {
      reading = null
      /* v8 ignore start: shrink race during a large-file read — same
         defensive guard as the official client */
      if (sent !== size) {
        out.destroy(new Error(`file shrank during publish: ${entry.name}`))
        return
      }
      /* v8 ignore stop */
      if (out.push(Buffer.from(tarPadding(size)))) next()
    })
  }

  return out
}

/**
 * gzip as node-tar's portable mode wrote it: the OS byte of the gzip header
 * (byte 9) is 255, "unknown", not the packing machine's OS — the archive
 * must be byte-identical regardless of who packs it.
 */
function portableGzip(): Transform {
  let first = true
  return new Transform({
    transform(chunk: unknown, _enc, cb): void {
      if (first && Buffer.isBuffer(chunk) && chunk.length > 9) {
        first = false
        chunk[9] = 255
      }
      cb(null, chunk)
    },
  })
}

/**
 * The upload body: entries packed under dirName (which the server strips),
 * gzipped. Returns the pipeline's destination stream — the bytes flow to the
 * network as they are packed, so a 450 MB project never sits in memory.
 */
function packBody(dirName: string, entries: ProjectEntry[]): Readable {
  return pipeline(
    tarStream(dirName, entries),
    createGzip(),
    portableGzip(),
    () => {},
  ) as Readable
}

// ── upload dedupe ("carry") ─────────────────────────────────────────────────

// smaller projects: the extra round trip costs more than it saves
const CARRY_MIN = 1024 * 1024
// the server's limit
const CARRY_FILES = 100_000
// under the server's 10 MB
const CARRY_BODY = 9 * 1024 * 1024

function hashFile(full: string): Promise<{ sha256: string; size: number }> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    let size = 0
    const s = createReadStream(full)
    s.on('data', (d) => {
      size += d.length
      hash.update(d)
    })
    s.on('error', reject)
    s.on('end', () => resolve({ sha256: hash.digest('hex'), size }))
  })
}

/** name → { sha256, size } for every entry, four files at a time. */
async function hashAll(
  entries: ProjectEntry[],
): Promise<Record<string, { sha256: string; size: number }>> {
  const out: Record<string, { sha256: string; size: number }> = {}
  let next = 0
  let active = 0
  await new Promise<void>((resolve, reject) => {
    const start = (): void => {
      while (active < 4 && next < entries.length) {
        const entry = entries[next++]!
        active++
        hashFile(entry.full)
          .then((h) => {
            active--
            out[entry.name] = h
            if (Object.keys(out).length === entries.length) return resolve()
            start()
          })
          .catch((err: Error) => {
            active--
            reject(err)
          })
      }
    }
    /* v8 ignore start: hashAll is only reached with at least one entry —
       carrying requires a non-empty project */
    if (entries.length === 0) resolve()
    else start()
    /* v8 ignore stop */
  })
  return out
}

interface CarryReply {
  ticket: string
  missing: string[]
}

/**
 * POST /:domain/carry — tell the server every file's sha256 and size; it
 * answers which files its current revision lacks, plus a ticket covering the
 * rest. Any trouble on the way just means the upload sends everything.
 */
async function askCarry(
  endpoint: string,
  domain: string,
  auth: BasicAuth | null,
  version: string,
  userAgent: string,
  entries: ProjectEntry[],
  fetchImpl: typeof globalThis.fetch,
): Promise<CarryReply | null> {
  let files: Record<string, { sha256: string; size: number }>
  try {
    files = await hashAll(entries)
  } catch {
    return null
  }
  const body = JSON.stringify({ files })
  /* v8 ignore next: the 100k-file cap keeps realistic manifests far under
     the server's 10 MB carry body; this guards a pathological name set */
  if (Buffer.byteLength(body) > CARRY_BODY) return null
  try {
    const res = await request({
      url: `${endpoint.replace(/\/+$/, '')}/${domain}/carry`,
      method: 'POST',
      headers: { version, 'user-agent': userAgent, accept: 'application/json' },
      body,
      auth,
      timeout: 30_000,
      fetchImpl,
    })
    if (res.status !== 200) return null
    let reply: unknown = null
    try {
      reply = JSON.parse(res.text)
    } catch {
      return null
    }
    if (
      !reply ||
      typeof reply !== 'object' ||
      !('ticket' in reply) ||
      !Array.isArray((reply as CarryReply).missing)
    ) {
      return null
    }
    return reply as CarryReply
  } catch {
    return null
  }
}

// ── publish ─────────────────────────────────────────────────────────────────

export interface PublishContext {
  endpoint: string
  credentials: Credentials | null
  /** SDK release number, sent as the `version` header (overridable per publish). */
  sdkVersion: string
  /** Full user-agent header value. */
  userAgent: string
  fetchImpl: typeof globalThis.fetch
}

/** Normalize add/rem header values: arrays join with commas. */
function headerValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value.join(',') : value
}

function totalSize(entries: ProjectEntry[]): number {
  return entries.reduce((n, e) => {
    try {
      return n + statSync(e.full).size
    } catch {
      /* v8 ignore next: entries were just scanned; guards a mid-publish
         removal before the size headers are built */
      return n
    }
  }, 0)
}

/** A handle that fails before any request, in the shape a server refusal arrives in. */
function refuseHandle(message: string): StreamHandle {
  const refused = new StreamHandle()
  queueMicrotask(() => {
    refused.emit('error', { error: { message } })
    refused.emit('fail', new Error(message))
  })
  return refused
}

/**
 * Publish a directory (or a single HTML file) to a domain.
 *
 * Files are gathered recursively, filtered by Surge's defaults plus
 * `.surgeignore`, packed into a gzipped USTAR tarball, and streamed to
 * `PUT /:domain`. The response is live NDJSON describing upload, CDN
 * propagation, certificate work, and the final result.
 *
 * Returns a {@link StreamHandle}: event-based (official-SDK familiar),
 * promise-based (`handle.completed`), or async-iterable.
 */
export function publish(
  ctx: PublishContext,
  projectPath: string,
  domain: string,
  options: PublishOptions = {},
): StreamHandle {
  let plan: ProjectPlan
  try {
    plan = createProject(projectPath)
  } catch (err) {
    // a missing path or unreadable project fails before any request
    /* v8 ignore next: fs errors are always Error instances */
    const error = err instanceof Error ? err : new Error(String(err))
    return refuseHandle(error.message)
  }

  // refused before any request, in the shape a server refusal arrives in
  if (plan.refused) {
    return refuseHandle(plan.refused)
  }

  const bytes = totalSize(plan.entries)

  // pre-flight the documented platform limits — refusing here saves a big
  // upload the server would reject anyway (opt out with validateLimits: false)
  if (options.validateLimits !== false) {
    const violation = limitViolation(plan.entries.length, bytes)
    if (violation) return refuseHandle(violation)
  }

  const auth = options.creds
    ? toBasicAuth(options.creds)
    : ctx.credentials
      ? toBasicAuth(ctx.credentials)
      : null

  const baseHeaders: Record<string, string | undefined> = {
    ...options.headers,
    message: options.message,
    timestamp: options.timestamp ?? new Date().toJSON(),
    stage:
      options.stage === true
        ? '1'
        : typeof options.stage === 'string'
          ? options.stage
          : undefined,
    add: headerValue(options.add),
    rem: headerValue(options.rem),
    ssl: options.ssl ? '1' : undefined,
    cmd: options.cmd,
  }
  if (options.version) baseHeaders['version'] = options.version

  // the CLI passes its whole parsed argv in the argv header, and the server
  // reads force/private from it — first-class options fold in the same way
  const argvPayload: Record<string, unknown> = { ...options.argv }
  if (options.force !== undefined) argvPayload['force'] = options.force
  if (options.private !== undefined) argvPayload['private'] = options.private
  const argv = Object.keys(argvPayload).length > 0 ? argvPayload : undefined

  // headers always describe the whole project, however much of it the
  // upload carries — a carried upload that goes stale is sent again in full
  const withSizes = (): Record<string, string | undefined> => ({
    ...baseHeaders,
    'file-count': String(plan.entries.length),
    'project-size': String(bytes),
  })

  const emitter = new StreamHandle()
  if (options.onProgress) {
    const onProgress = options.onProgress
    emitter.on('progress', (p) => onProgress(p))
  }

  const send = (entries: ProjectEntry[], ticket?: string): void => {
    let body: Readable
    try {
      body = packBody(plan.dirName, entries)
    } catch (err) {
      /* v8 ignore start: packBody only throws synchronously on a tar-field
         overflow, which the earlier scan makes impossible */
      queueMicrotask(() =>
        emitter.emit('fail', err instanceof Error ? err : new Error(String(err))),
      )
      return
      /* v8 ignore stop */
    }
    handshake({
      endpoint: ctx.endpoint,
      path: domain,
      body,
      contentType: 'application/gzip',
      headers: {
        ...withSizes(),
        ...(ticket ? { 'carry-ticket': ticket } : {}),
      },
      argv,
      auth,
      version: options.version ?? ctx.sdkVersion,
      userAgent: ctx.userAgent,
      signal: options.signal,
      fetchImpl: ctx.fetchImpl,
      handle: emitter,
      retry: ticket
        ? () => {
            // stale ticket: send everything again, once, on the same handle
            send(plan.entries)
          }
        : undefined,
    })
  }

  const carrying =
    !plan.single && bytes >= CARRY_MIN && plan.entries.length <= CARRY_FILES

  if (!carrying) {
    send(plan.entries)
  } else {
    void askCarry(
      ctx.endpoint,
      domain,
      auth,
      options.version ?? ctx.sdkVersion,
      ctx.userAgent,
      plan.entries,
      ctx.fetchImpl,
    ).then((reply) => {
      if (!reply) {
        send(plan.entries)
        return
      }
      const missing = new Set(reply.missing)
      const entries = plan.entries.filter((e) => missing.has(e.name))
      emitter.emit('carry', {
        carried: plan.entries.length - entries.length,
        sent: entries.length,
      })
      send(entries, reply.ticket)
    })
  }

  // the caller attaches its listeners only after this returns
  if (plan.single) {
    queueMicrotask(() => emitter.emit('single', plan.single))
  }
  if (plan.skipped.length > 0) {
    queueMicrotask(() => emitter.emit('skipped', plan.skipped))
  }

  return emitter
}
