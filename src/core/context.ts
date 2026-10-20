import type { ClientOptions, StatusHandlers } from '../types/client.js'
import type { Credentials, RequestOptions } from '../types/primitives.js'
import { resolveCredentials, toBasicAuth } from './credentials.js'
import { errorFromResponse } from './errors.js'
import { request } from './request.js'
import { SDK_VERSION } from '../version.js'

/** Default base URL of the public Surge platform. */
export const DEFAULT_ENDPOINT = 'https://surge.surge.sh'

/** Default timeout for JSON requests. */
export const DEFAULT_TIMEOUT = 30_000

/** JSON body parse: JSON when possible, raw text otherwise, "" when empty. */
export function parseBody(text: string): unknown {
  if (!text) return ''
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

/**
 * Shared machinery every resource namespace is built on: endpoint, credential
 * resolution, the fetch transport, status handlers, and error mapping.
 */
export class RequestContext {
  readonly endpoint: string
  readonly fetchImpl: typeof globalThis.fetch
  /** Full user-agent header value. */
  readonly userAgent: string
  /** SDK release number, sent as the `version` header on deploys. */
  readonly sdkVersion: string
  readonly timeout: number
  private readonly defaults: {
    token?: string
    email?: string
    password?: string
  }
  private readonly onStatus: StatusHandlers

  constructor(options: ClientOptions = {}) {
    const envEndpoint = process.env['SURGE_ENDPOINT']
    this.endpoint = (options.endpoint ?? envEndpoint ?? DEFAULT_ENDPOINT).replace(
      /\/+$/,
      '',
    )
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.userAgent = options.userAgent ?? `surgejs-sdk/${SDK_VERSION}`
    this.sdkVersion = SDK_VERSION
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT
    this.defaults = {
      token: options.token,
      email: options.email,
      password: options.password,
    }
    this.onStatus = options.onStatus ?? {}
  }

  /** Resolve credentials for one call: per-call → client config → env. */
  credentialsFor(override?: Credentials): Credentials | null {
    return resolveCredentials(override, this.defaults)
  }

  /**
   * Perform one JSON API call.
   *
   * - Resolves with the parsed body on 2xx.
   * - Runs any registered `onStatus` handler before failing.
   * - Rejects with the matching typed error otherwise.
   * - `auth: false` skips credentials entirely (public endpoints).
   */
  async call<T>(
    method: string,
    path: string,
    options: RequestOptions & {
      body?: unknown
      auth?: boolean
    } = {},
  ): Promise<T> {
    const headers: Record<string, string | undefined> = {
      accept: 'application/json',
      'user-agent': this.userAgent,
      ...options.headers,
    }

    let auth: { username: string; password: string } | null = null
    if (options.auth !== false) {
      const creds = this.credentialsFor(options.creds)
      if (creds) auth = toBasicAuth(creds)
    }

    const body =
      options.body === undefined || options.body === null
        ? undefined
        : JSON.stringify(options.body)

    const res = await request({
      url: `${this.endpoint}${path.startsWith('/') ? path : `/${path}`}`,
      method,
      headers,
      body,
      auth,
      signal: options.signal,
      timeout: this.timeout,
      fetchImpl: this.fetchImpl,
    })

    const data = parseBody(res.text)

    if (res.status >= 200 && res.status < 300) return data as T

    const error = errorFromResponse(res.status, data, res.headers)

    // handlers run before the failure path: tools register 401/403 handlers
    // that exit the process, so the rejection below is deliberately still
    // thrown for handlers that choose not to
    const handler = this.onStatus[res.status]
    if (handler) handler(error, { status: res.status, headers: res.headers }, data)

    throw error
  }
}
