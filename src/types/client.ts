import type { SurgeError } from '../core/errors.js'

/** Handler registered for a specific HTTP status code. */
export type StatusHandler = (
  error: SurgeError,
  response: { status: number; headers: Record<string, string> },
  body: unknown,
) => void

/** Map of HTTP status code → handler, run before the method's own failure path. */
export type StatusHandlers = Partial<Record<number, StatusHandler>>

/** Configuration accepted by `createClient`. */
export interface ClientOptions {
  /** Base URL of the Surge API. Defaults to `https://surge.surge.sh`. */
  endpoint?: string
  /** API token (or set `SURGE_TOKEN`). */
  token?: string
  /** Account email — pair with `password` to mint tokens via `auth.login`. */
  email?: string
  /** Account password — only used to mint tokens. */
  password?: string
  /** Custom fetch implementation (tests, proxies, polyfills). */
  fetch?: typeof globalThis.fetch
  /** Override the `user-agent` header. Defaults to `surgejs-sdk/<version>`. */
  userAgent?: string
  /** Timeout for JSON requests, in milliseconds. 0 disables. Default 30_000. */
  timeout?: number
  /** Cross-cutting handlers for specific HTTP status codes. */
  onStatus?: StatusHandlers
}
