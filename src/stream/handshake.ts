import type { BasicAuth } from '../types/primitives.js'
import { requestStream } from '../core/request.js'
import type { RequestBody } from '../core/request.js'
import { errorFromResponse } from '../core/errors.js'
import { parseBody } from '../core/context.js'
import { StreamHandle } from './handle.js'

/**
 * One handshake for all three streaming verbs (publish, encrypt, ssl).
 * They differ only in the path they PUT to, what they send as a body, and
 * the content-type; everything after the response is identical.
 *
 * The Surge API answers with newline-delimited JSON — one object per line,
 * emitted as the work progresses. Every frame is re-emitted both as a
 * generic `data` event and as an event named after its `type` field.
 * Lifecycle events (`success`, `fail`, `unauthorized`, …) are layered on top.
 *
 * Emissions only happen after the response arrives (at least a microtask
 * later), so the caller can attach listeners right after this function
 * returns and never miss a frame.
 */

export interface HandshakeOptions {
  endpoint: string
  path: string
  method?: string
  body?: RequestBody | null
  contentType?: string
  headers?: Record<string, string | undefined>
  argv?: Record<string, unknown>
  auth?: BasicAuth | null
  /** SDK release number, sent as the `version` header. */
  version: string
  /** Full user-agent header value. */
  userAgent: string
  signal?: AbortSignal
  fetchImpl?: typeof globalThis.fetch
  /** The caller's handle, to keep one across a carry retry. */
  handle?: StreamHandle
  /** Called in place of fail when a carried publish went stale. */
  retry?: () => void
}

/** Status-specific events before the generic fail — a bare fail is what tools treat as an unexplained failure. */
function emitStatus(
  emitter: StreamHandle,
  status: number,
  headers: Record<string, string>,
): void {
  const reason = headers['reason'] ?? ''
  if (status === 401) emitter.emit('unauthorized', reason || 'Unauthorized')
  if (status === 403) emitter.emit('forbidden', reason || 'Forbidden')
  if (status === 422) emitter.emit('invalid', reason || 'Invalid')
  if (status === 429) {
    emitter.emit('ratelimited', reason || 'Rate limited. Try again later.')
  }
}

/** Split a web ReadableStream into text lines. */
export async function* readLines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      // sequential by design: NDJSON frames must be processed in order
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx = buffer.indexOf('\n')
      while (idx !== -1) {
        yield buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        idx = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    if (buffer.length > 0) yield buffer
  } finally {
    reader.releaseLock()
  }
}

/** Parse one NDJSON line; null for blank or unparseable lines. */
export function parseFrame(line: string): Record<string, unknown> | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const obj = JSON.parse(trimmed) as unknown
    if (obj && typeof obj === 'object') return obj as Record<string, unknown>
    return null
  } catch {
    return null
  }
}

/** Read a (small) error body to build a useful typed error. */
async function readErrorBody(
  body: ReadableStream<Uint8Array> | null,
): Promise<string> {
  /* v8 ignore next: requestStream refuses a bodyless response, so the null
     case cannot arrive here — kept for direct callers of handshake() */
  if (!body) return ''
  try {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    for (;;) {
      // sequential by design: draining the error body in arrival order
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      if (text.length > 64 * 1024) break
    }
    return text
  } catch {
    /* v8 ignore next: a body stream that dies mid-error-read */
    return ''
  }
}

export function handshake(opts: HandshakeOptions): StreamHandle {
  const emitter: StreamHandle = opts.handle ?? new StreamHandle()
  const canRetry = opts.retry !== undefined

  const headers: Record<string, string | undefined> = {
    version: opts.version,
    'user-agent': opts.userAgent,
    ...opts.headers,
  }
  if (opts.argv) headers['argv'] = JSON.stringify(opts.argv)
  headers['accept'] = 'application/x-ndjson'
  if (opts.contentType) headers['content-type'] = opts.contentType

  void (async (): Promise<void> => {
    let response
    try {
      response = await requestStream({
        url: `${opts.endpoint.replace(/\/+$/, '')}/${opts.path.replace(/^\/+/, '')}`,
        method: opts.method ?? 'PUT',
        headers,
        body: opts.body,
        auth: opts.auth,
        signal: opts.signal,
        fetchImpl: opts.fetchImpl,
        stream: true,
      })
    } catch (error) {
      /* v8 ignore next: requestStream rejects with SurgeNetworkError */
      emitter.emit(
        'fail',
        error instanceof Error ? error : new Error(String(error)),
      )
      return
    }

    emitter.emit('response', {
      status: response.status,
      headers: response.headers,
    })

    if (response.status < 200 || response.status >= 300) {
      emitStatus(emitter, response.status, response.headers)
      // read the error body so the rejection carries the server's message
      const text = await readErrorBody(response.body)
      const err = errorFromResponse(
        response.status,
        parseBody(text),
        response.headers,
      )
      emitter.emit('fail', err)
      return
    }

    let succeeded = false
    let wentStale = false
    let infoPayload: Record<string, unknown> = {}

    try {
      for await (const line of readLines(response.body)) {
        const frame = parseFrame(line)
        if (!frame) continue

        // the carry ticket died server-side: the publish goes again in full,
        // and this frame is swallowed rather than surfaced as a failure
        if (
          canRetry &&
          frame['type'] === 'error' &&
          frame['error'] !== null &&
          typeof frame['error'] === 'object' &&
          (frame['error'] as { carry?: string }).carry === 'stale'
        ) {
          wentStale = true
          continue
        }

        emitter.emit('data', frame)

        if (frame['type'] === 'info') {
          succeeded = true
          infoPayload = { ...frame }
        }

        const type = frame['type']
        if (typeof type === 'string') {
          delete frame['type']
          emitter.emit(type, frame)
        }
      }
    } catch (error) {
      /* v8 ignore next: the reader rejects with Error instances */
      const err = error instanceof Error ? error : new Error(String(error))
      emitter.emit('transportError', err)
      emitter.emit('fail', err)
      return
    }

    if (!succeeded && canRetry && wentStale) {
      opts.retry?.()
      return
    }

    if (succeeded) {
      delete infoPayload['type']
      emitter.emit('success', infoPayload)
    } else {
      emitter.emit('fail')
    }
  })()

  return emitter
}
