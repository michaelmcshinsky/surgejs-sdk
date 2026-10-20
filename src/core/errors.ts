/**
 * Typed error hierarchy for every failure the SDK can produce.
 *
 * HTTP failures carry the server's `messages` / `details` shape plus the
 * status code; network failures carry the underlying `cause` code
 * (ECONNREFUSED, ENOTFOUND, …) when available.
 */

export interface SurgeErrorInit {
  status?: number
  messages?: string[]
  details?: Record<string, unknown>
  cause?: unknown
  headers?: Record<string, string>
}

/** Base class for every error thrown by this SDK. */
export class SurgeError extends Error {
  readonly status?: number
  readonly messages: string[]
  readonly details?: Record<string, unknown>
  readonly headers?: Record<string, string>

  constructor(message: string, init: SurgeErrorInit = {}) {
    super(message, init.cause !== undefined ? { cause: init.cause } : undefined)
    this.name = 'SurgeError'
    this.status = init.status
    this.messages = init.messages ?? [message]
    this.details = init.details
    this.headers = init.headers
  }
}

/** An HTTP response with a non-2xx status. */
export class SurgeHttpError extends SurgeError {
  constructor(message: string, init: SurgeErrorInit = {}) {
    super(message, init)
    this.name = 'SurgeHttpError'
  }
}

/** 401 — missing or invalid credentials; the token is expired or revoked. */
export class SurgeAuthError extends SurgeHttpError {
  constructor(message: string, init: SurgeErrorInit = {}) {
    super(message, init)
    this.name = 'SurgeAuthError'
  }
}

/** 403 — authenticated but not allowed (permission, rate limit, size cap). */
export class SurgePermissionError extends SurgeHttpError {
  constructor(message: string, init: SurgeErrorInit = {}) {
    super(message, init)
    this.name = 'SurgePermissionError'
  }
}

/** 404 — no such project, revision, token, or account. */
export class SurgeNotFoundError extends SurgeHttpError {
  constructor(message: string, init: SurgeErrorInit = {}) {
    super(message, init)
    this.name = 'SurgeNotFoundError'
  }
}

/** 409 — conflict, e.g. deleting an account that still has projects. */
export class SurgeConflictError extends SurgeHttpError {
  constructor(message: string, init: SurgeErrorInit = {}) {
    super(message, init)
    this.name = 'SurgeConflictError'
  }
}

/** 400 / 422 — invalid input (bad domain, invalid DNS record). */
export class SurgeValidationError extends SurgeHttpError {
  constructor(message: string, init: SurgeErrorInit = {}) {
    super(message, init)
    this.name = 'SurgeValidationError'
  }
}

/** 429 — rate limited; retry after the window (halved for unverified accounts). */
export class SurgeRateLimitError extends SurgeHttpError {
  constructor(message: string, init: SurgeErrorInit = {}) {
    super(message, init)
    this.name = 'SurgeRateLimitError'
  }
}

/** The request never completed (DNS failure, connection refused, timeout…). */
export class SurgeNetworkError extends SurgeError {
  constructor(message: string, init: SurgeErrorInit = {}) {
    super(message, init)
    this.name = 'SurgeNetworkError'
  }
}

/** Describe a status the server gave no body for. */
export function describeStatus(status: number): string {
  return status >= 300 && status < 400
    ? `endpoint redirected (${status})`
    : `request failed (${status})`
}

type ErrorBody = {
  messages?: unknown
  message?: unknown
  errors?: unknown
  details?: unknown
}

function toStrings(value: unknown): string[] | undefined {
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return value as string[]
  }
  if (typeof value === 'string') return [value]
  return undefined
}

/**
 * Build the right typed error for a non-2xx response.
 *
 * Reads the server's `{ messages, details }` shape, falls back to
 * `{ message }` / `{ errors }`, then to the `reason` header, then to a
 * generic description of the status — an empty body must never read as a
 * silent success.
 */
export function errorFromResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): SurgeError {
  const init: SurgeErrorInit = { status, headers }
  let messages: string[] | undefined

  if (body && typeof body === 'object') {
    const b = body as ErrorBody
    messages = toStrings(b.messages) ?? toStrings(b.errors)
    if (!messages && typeof b.message === 'string') messages = [b.message]
    if (b.details && typeof b.details === 'object') {
      init.details = b.details as Record<string, unknown>
    }
  } else if (typeof body === 'string' && body.trim()) {
    messages = [body.trim()]
  }

  if (!messages || messages.length === 0) {
    const reason = headers['reason']
    messages = reason ? [reason] : [describeStatus(status)]
  }

  init.messages = messages
  const message = messages.join('; ')

  switch (status) {
    case 401:
      return new SurgeAuthError(message, init)
    case 403:
      return new SurgePermissionError(message, init)
    case 404:
      return new SurgeNotFoundError(message, init)
    case 409:
      return new SurgeConflictError(message, init)
    case 400:
    case 422:
      return new SurgeValidationError(message, init)
    case 429:
      return new SurgeRateLimitError(message, init)
    default:
      return new SurgeHttpError(message, init)
  }
}

/** Wrap a transport-level failure (fetch rejection, abort, timeout). */
export function networkError(cause: unknown): SurgeNetworkError {
  const causeCode =
    cause && typeof cause === 'object' && 'code' in cause
      ? String((cause as { code: unknown }).code)
      : undefined
  const causeMessage =
    cause instanceof Error ? cause.message : String(cause ?? 'unknown error')
  const message = causeCode ? `${causeMessage} (${causeCode})` : causeMessage
  return new SurgeNetworkError(message, { cause })
}
