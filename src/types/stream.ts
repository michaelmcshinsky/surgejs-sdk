import type { Credentials } from './primitives.js'
import type { DeployMetadata } from './project.js'

/** A CDN edge node serving a project. */
export interface Instance {
  protocol?: string
  host?: string
  region?: string
  location?: string
  ip?: string
  provider?: string
}

/** Certificate details carried on a `cert` / `ssl` stream frame. */
export interface CertData {
  issuer?: string
  altnames?: string[]
  expiresInWords?: string
}

/** The `info` frame — the authoritative success payload of a deploy. */
export interface DeployInfo {
  urls: string[]
  instances: Instance[]
  metadata: DeployMetadata
  config?: Record<string, unknown>
  certs?: CertData | Record<string, unknown> | null
  /** A one-line call-to-action the server wants shown with the result. */
  cta?: string
}

/** A `progress` frame: progress through one phase of the deploy. */
export interface DeployProgress {
  /** Phase: `upload` (tarball going up), `cdn` (edge propagation), `encrypt`. */
  id: string
  written?: number
  total?: number
  file?: string
  /** Present on the final message of a phase. */
  end?: boolean
}

/** A `msg` frame — a human-readable server message. */
export interface MsgPayload {
  payload: { msg: string; status?: number | string }
}

/** A `collect` frame — payment required before the operation can finish. */
export interface CollectPayload {
  plan?: { id?: string; name?: string; amount?: number; trial_period_days?: number }
  card?: unknown
  stripe_pk?: string
  perks?: string[]
  /** Browser checkout URL when the server offers one. */
  checkout_url?: string
}

/** A `single` frame — emitted client-side for a one-file project. */
export interface SingleFileInfo {
  file: string
  as: string
  /** Relative references found in the page that exist on disk. */
  local: string[]
}

/** A `carry` frame — emitted client-side when upload dedupe is in play. */
export interface CarryInfo {
  carried: number
  sent: number
}

/** An `error` frame from the server: a server abort, or a build-time compile error. */
export interface ErrorPayload {
  error: {
    message?: string
    carry?: string
    /** Compile-error shape: which file failed, and where. */
    filename?: string
    stack?: string
    lineno?: number
    [key: string]: unknown
  }
}

/**
 * Every frame emitted by a streaming operation.
 *
 * Server frames (`progress`, `info`, `cert`, `ssl`, `subscription`, `collect`,
 * `msg`, `users`, `error`) come from the NDJSON response. Client frames
 * (`carry`, `single`, `skipped`) describe local decisions made before upload.
 */
export type StreamEvent =
  | ({ type: 'progress' } & DeployProgress)
  | ({ type: 'info' } & DeployInfo)
  | { type: 'cert'; data: CertData }
  | { type: 'ssl'; data: CertData }
  | { type: 'subscription'; data: unknown }
  | ({ type: 'collect' } & CollectPayload)
  | ({ type: 'msg' } & MsgPayload)
  | { type: 'users'; users: string[] }
  | ({ type: 'carry' } & CarryInfo)
  | { type: 'single'; single: SingleFileInfo }
  | { type: 'skipped'; skipped: string[] }
  | ({ type: 'error' } & ErrorPayload)

/** Event names a streaming operation can emit, mapped to their payloads. */
export interface StreamEventMap {
  data: StreamEvent
  progress: DeployProgress
  info: DeployInfo
  cert: { data: CertData }
  ssl: { data: CertData }
  subscription: { data: unknown }
  collect: CollectPayload
  msg: MsgPayload
  users: { users: string[] }
  carry: CarryInfo
  single: SingleFileInfo
  skipped: string[]
  error: ErrorPayload
  /** The stream ended after an `info` frame. Payload is the deploy result. */
  success: DeployInfo
  /** The stream ended without an `info` frame, or the request failed. */
  fail: undefined
  /** A transport error on the response stream. */
  transportError: Error
  /** HTTP 401 — token invalid or expired. Payload is the server's reason. */
  unauthorized: string
  /** HTTP 403 — not permitted (not a collaborator, rate limited, too large). */
  forbidden: string
  /** HTTP 422 — the domain is invalid. */
  invalid: string
  /** HTTP 429 — rate limited. */
  ratelimited: string
  /** The raw HTTP response status/headers, before any frames. */
  response: { status: number; headers: Record<string, string> }
}

/** Options accepted by `client.publish`. */
export interface PublishOptions {
  /** Deploy message shown in the revision list. */
  message?: string
  /** Stage the deploy (preview only) instead of cutting over production. */
  stage?: boolean | string
  /** Force 'http' or 'https' for the project — remembered as platform config. */
  force?: 'http' | 'https'
  /** Require sign-in for the whole domain (publish + lock in one move). */
  private?: boolean
  /** Collaborator emails to add as part of the deploy. */
  add?: string | string[]
  /** Collaborator emails to remove as part of the deploy. */
  rem?: string | string[]
  /** Force HTTPS for the project (alias of `force: 'https'`). */
  ssl?: boolean
  /** Your tool's version string (overrides the SDK's `version` header). */
  version?: string
  /** Tool name sent as the `cmd` header, mirroring the CLI. */
  cmd?: string
  /** Deploy timestamp (ISO 8601). Defaults to now. */
  timestamp?: string
  /** Serialized into an `argv` header for the server. */
  argv?: Record<string, unknown>
  /**
   * Pre-flight the documented project limits (10,100 files / 450 MB) and
   * refuse before uploading. Default true; set false to skip.
   */
  validateLimits?: boolean
  /** Extra HTTP headers merged last. */
  headers?: Record<string, string>
  /** Abort the upload. */
  signal?: AbortSignal
  /** Override the client's credentials for this publish. */
  creds?: Credentials
  /** Convenience progress callback (same data as the `progress` event). */
  onProgress?: (progress: DeployProgress) => void
}

/** Options accepted by `client.encrypt` and `client.ssl`. */
export interface StreamOptions {
  /** Your tool's version string. */
  version?: string
  /** Serialized into an `argv` header. */
  argv?: Record<string, unknown>
  /** Extra HTTP headers merged last. */
  headers?: Record<string, string>
  /** Abort the request. */
  signal?: AbortSignal
  /** Override the client's credentials. */
  creds?: Credentials
}

/** A file entry to pack into the archive. */
export interface ProjectEntry {
  /** Path inside the project (posix separators, relative). */
  name: string
  /** Absolute path on disk the content is read from. */
  full: string
}

/** What a project directory is made of, before packing. */
export interface ProjectPlan {
  entries: ProjectEntry[]
  /** Top-level directory name; the server strips it. */
  dirName: string
  /** Paths skipped (dangling symlinks, cycle members, fifos/sockets). */
  skipped: string[]
  /** Set for a one-file project. */
  single?: SingleFileInfo
  /** Set when the project cannot be published at all. */
  refused?: string
}
