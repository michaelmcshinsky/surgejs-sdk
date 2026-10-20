import type { BasicAuth } from '../types/primitives.js'
import { networkError } from './errors.js'

/**
 * HTTP transport for the SDK, built on the global `fetch` (Node ≥ 18.13).
 *
 * Ported from the official surge-sdk request layer with the same quirks that
 * matter on the wire:
 * - header values are sanitized to latin-1-safe text (an emoji in a deploy
 *   message must not fail the publish);
 * - Basic auth is UTF-8–safe (non-ASCII passwords encode correctly);
 * - redirects are never followed (a 3xx must not carry the token onward);
 * - fetch's "fetch failed" hides the real code in `.cause` — it is lifted out.
 */

/** Body types fetch accepts, plus async iterables (Node zlib streams). */
export type RequestBody =
  | NonNullable<RequestInit['body']>
  | AsyncIterable<Uint8Array>

export interface RawRequestOptions {
  url: string
  method?: string
  headers?: Record<string, string | undefined>
  /**
   * String body, anything fetch accepts as a buffered/streamed body, or an
   * async iterable (Node's zlib streams qualify) — undici consumes those
   * with `duplex: 'half'`.
   */
  body?: RequestBody | null
  auth?: BasicAuth | null
  /** Skip reading the body; hand back the raw stream for NDJSON consumers. */
  stream?: boolean
  /** Abort the request. */
  signal?: AbortSignal
  /** Milliseconds before the request is aborted. 0 disables. */
  timeout?: number
  fetchImpl?: typeof globalThis.fetch
}

/** Result of a buffered (non-stream) request. */
export interface TextResponse {
  status: number
  headers: Record<string, string>
  text: string
}

/** Result of a streaming request — the raw body stream. */
export interface StreamResponse {
  status: number
  headers: Record<string, string>
  body: ReadableStream<Uint8Array>
}

/**
 * fetch refuses header values above U+00FF or with control characters;
 * Node's http quietly dropped them. Strip rather than throw — the header is
 * cosmetic, the operation is not. Tab and the latin-1 supplement are legal.
 */
export function headerSafe(value: unknown): string {
  return String(value).replace(/[^\t\x20-\x7e\xa0-\xff]/g, '')
}

function cleanHeaders(
  headers: Record<string, string | undefined> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value === undefined || value === null) continue
    out[key.toLowerCase()] = headerSafe(value)
  }
  return out
}

/**
 * UTF-8–safe Basic auth header. `btoa` is latin-1 and throws above U+00FF,
 * so encode to bytes first — that keeps a non-ASCII password working.
 */
export function basicAuthHeader(auth: BasicAuth): string {
  const raw = `${auth.username ?? ''}:${auth.password ?? ''}`
  const bytes = new TextEncoder().encode(raw)
  let latin = ''
  for (let i = 0; i < bytes.length; i++) latin += String.fromCharCode(bytes[i]!)
  return `Basic ${btoa(latin)}`
}

/**
 * Join an endpoint and a path with exactly one slash — never zero, never two.
 * Absolute URLs pass through untouched. Not `URL.resolve`, which drops the
 * last segment of an endpoint that itself carries a path.
 */
export function joinUrl(endpoint: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${endpoint.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function plainHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}

function buildInit(opts: RawRequestOptions): RequestInit & { duplex?: 'half' } {
  const headers = cleanHeaders(opts.headers)

  const sending = opts.body !== undefined && opts.body !== null
  if (sending && typeof opts.body === 'string' && !headers['content-type']) {
    headers['content-type'] = 'application/json'
  }
  // fetch sets content-length itself and forbids setting it by hand
  delete headers['content-length']

  if (opts.auth) headers['authorization'] = basicAuthHeader(opts.auth)

  const init: RequestInit & { duplex?: 'half' } = {
    method: opts.method ?? 'GET',
    headers,
    // Node does not follow redirects; carrying an Authorization header to a
    // redirect target would leak the token. Browsers strip it themselves.
    redirect: 'manual',
  }
  if (sending) {
    init.body = opts.body
    // required by Node whenever the body is not buffered up front
    if (typeof opts.body !== 'string') init.duplex = 'half'
  }
  return init
}

function withTimeout(
  signal: AbortSignal | undefined,
  timeout: number | undefined,
): { signal?: AbortSignal; cleanup: () => void } {
  if (!timeout || timeout <= 0) return { signal, cleanup: () => {} }
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error(`request timed out after ${timeout}ms`))
  }, timeout)
  const onAbort = (): void => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

function propagateCause(error: unknown): never {
  // fetch reports every transport failure as a bare "fetch failed"; the
  // useful code (ECONNREFUSED, ENOTFOUND, CERT_*) hides in .cause
  if (error && typeof error === 'object' && 'cause' in error) {
    const cause = (error as { cause?: unknown }).cause
    if (cause && typeof cause === 'object' && 'code' in cause) {
      ;(error as { code?: string }).code = String((cause as { code: unknown }).code)
    }
  }
  throw networkError(error)
}

/**
 * Perform one HTTP request and read the body as text. HTTP error statuses
 * resolve normally (status + text) so callers can map them to typed errors;
 * only transport failures reject.
 */
export async function request(
  opts: RawRequestOptions & { stream?: false | undefined },
): Promise<TextResponse> {
  const { signal, cleanup } = withTimeout(opts.signal, opts.timeout)
  const doFetch = opts.fetchImpl ?? globalThis.fetch
  if (typeof doFetch !== 'function') {
    throw networkError(new Error('global fetch is unavailable — Node >= 18.13 is required'))
  }
  try {
    const res = await doFetch(opts.url, { ...buildInit(opts), signal })
    const text = await res.text()
    return { status: res.status, headers: plainHeaders(res.headers), text }
  } catch (error) {
    propagateCause(error)
  } finally {
    cleanup()
  }
}

/**
 * Perform one HTTP request and hand back the raw body stream (NDJSON mode).
 * The caller is responsible for consuming `body`.
 */
export async function requestStream(
  opts: RawRequestOptions & { stream: true },
): Promise<StreamResponse> {
  const { signal, cleanup } = withTimeout(opts.signal, opts.timeout)
  const doFetch = opts.fetchImpl ?? globalThis.fetch
  if (typeof doFetch !== 'function') {
    throw networkError(new Error('global fetch is unavailable — Node >= 18.13 is required'))
  }
  try {
    const res = await doFetch(opts.url, { ...buildInit(opts), signal })
    if (!res.body) {
      throw networkError(new Error('response has no body stream'))
    }
    return { status: res.status, headers: plainHeaders(res.headers), body: res.body }
  } catch (error) {
    propagateCause(error)
  } finally {
    cleanup()
  }
}
