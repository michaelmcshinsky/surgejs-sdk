/**
 * surgejs-sdk — modern TypeScript SDK for the Surge.sh static publishing
 * platform.
 *
 * ```ts
 * import { createClient } from 'surgejs-sdk'
 *
 * const client = createClient({ token: process.env.SURGE_TOKEN })
 *
 * // JSON API — namespaced, async, fully typed
 * const projects = await client.projects.list()
 * await client.dns.add('example.com', { type: 'MX', name: '@', value: 'mail.example.com', priority: 10 })
 *
 * // Streaming publish — events, a promise, or async iteration
 * const handle = client.publish('./dist', 'example.com', { message: 'ship it' })
 * handle.on('progress', (p) => process.stderr.write('.'))
 * const info = await handle.completed
 * ```
 *
 * Low-level streaming pieces (tar writer, project scanner, NDJSON handshake)
 * are also exported from `surgejs-sdk/stream`.
 */

export { createClient, SurgeClient } from './client.js'
export { SDK_VERSION } from './version.js'
export {
  PROJECT_LIMITS,
  PUBLISH_RATE_LIMITS,
  SURGE_A_RECORD,
  SURGE_CNAME_TARGET,
  SURGE_DNS,
  SURGE_NAME_SERVERS,
  SURGE_NS_DOMAIN,
  isValidDomain,
  limitViolation,
  previewUrl,
} from './platform.js'
export { readCname, writeCname } from './cname.js'
export type { CnameResult } from './cname.js'
export {
  DEFAULT_ENDPOINT,
  DEFAULT_TIMEOUT,
  RequestContext,
} from './core/context.js'
export {
  SurgeError,
  SurgeHttpError,
  SurgeAuthError,
  SurgePermissionError,
  SurgeNotFoundError,
  SurgeConflictError,
  SurgeValidationError,
  SurgeRateLimitError,
  SurgeNetworkError,
  errorFromResponse,
} from './core/errors.js'
export { toBasicAuth, resolveCredentials } from './core/credentials.js'
export { headerSafe, basicAuthHeader, joinUrl } from './core/request.js'
export { StreamHandle } from './stream/handle.js'
export type * from './types/index.js'
