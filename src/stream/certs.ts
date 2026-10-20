import { createReadStream, statSync } from 'node:fs'
import type { Credentials, StreamOptions } from '../types/index.js'
import { toBasicAuth } from '../core/credentials.js'
import { handshake } from './handshake.js'
import { StreamHandle } from './handle.js'

export interface StreamContext {
  endpoint: string
  credentials: Credentials | null
  /** SDK release number, sent as the `version` header. */
  sdkVersion: string
  /** Full user-agent header value. */
  userAgent: string
  fetchImpl: typeof globalThis.fetch
}

/**
 * PUT /:domain/encrypt — provision a managed SSL certificate for a custom
 * domain. Same NDJSON event model as publish; no request body.
 */
export function encrypt(
  ctx: StreamContext,
  domain: string,
  options: StreamOptions = {},
): StreamHandle {
  const auth = options.creds
    ? toBasicAuth(options.creds)
    : ctx.credentials
      ? toBasicAuth(ctx.credentials)
      : null

  return handshake({
    endpoint: ctx.endpoint,
    path: `${domain}/encrypt`,
    headers: options.headers,
    argv: options.argv,
    auth,
    version: options.version ?? ctx.sdkVersion,
    userAgent: ctx.userAgent,
    signal: options.signal,
    fetchImpl: ctx.fetchImpl,
  })
}

/**
 * PUT /:domain/ssl — stream a PEM bundle (certificate + intermediates + key)
 * to the platform. Paid plans only. The server validates the PEM before
 * accepting it; an invalid bundle fails with an HTTP 400.
 */
export function ssl(
  ctx: StreamContext,
  pemPath: string,
  domain: string,
  options: StreamOptions = {},
): StreamHandle {
  const auth = options.creds
    ? toBasicAuth(options.creds)
    : ctx.credentials
      ? toBasicAuth(ctx.credentials)
      : null

  let isFile = false
  try {
    isFile = statSync(pemPath).isFile()
  } catch {
    isFile = false
  }
  if (!isFile) {
    const refused = new StreamHandle()
    queueMicrotask(() => {
      refused.emit('error', {
        error: { message: `PEM file not found: ${pemPath}` },
      })
      refused.emit('fail', new Error(`PEM file not found: ${pemPath}`))
    })
    return refused
  }

  return handshake({
    endpoint: ctx.endpoint,
    path: `${domain}/ssl`,
    body: createReadStream(pemPath),
    contentType: 'application/x-pem-file',
    headers: options.headers,
    argv: options.argv,
    auth,
    version: options.version ?? ctx.sdkVersion,
    userAgent: ctx.userAgent,
    signal: options.signal,
    fetchImpl: ctx.fetchImpl,
  })
}
