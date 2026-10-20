/**
 * Low-level streaming utilities, also available from the package root via
 * the client (`client.publish`, `client.encrypt`, `client.ssl`).
 *
 * Import from `surgejs-sdk/stream` when building custom tooling on top of
 * the raw pieces: the tar writer, the project scanner, or the NDJSON
 * handshake itself.
 */

export { StreamHandle } from './handle.js'
export { handshake, parseFrame, readLines } from './handshake.js'
export type { HandshakeOptions } from './handshake.js'
export { publish, createProject } from './publish.js'
export type { PublishContext } from './publish.js'
export { encrypt, ssl } from './certs.js'
export type { StreamContext } from './certs.js'
export { tarHeader, tarPadding, tarEnd } from './tar.js'
export {
  createIgnorer,
  htmlReferences,
  singleFile,
  DEFAULT_IGNORES,
} from './project.js'
export type { IgnoreManager, SingleResult } from './project.js'
