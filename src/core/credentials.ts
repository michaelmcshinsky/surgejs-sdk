import type { BasicAuth, Credentials } from '../types/primitives.js'

/**
 * Normalize any accepted credential shape to a Basic-auth pair.
 *
 * - `"token-string"` → `{ username: "token", password: "<token>" }`
 * - `{ user }` / `{ username }`, `{ pass }` / `{ password }` are aliases
 * - Email + password mints tokens; everything else uses a token
 */
export function toBasicAuth(credentials: Credentials): BasicAuth {
  if (typeof credentials === 'string') {
    return { username: 'token', password: credentials }
  }
  const username = credentials.username ?? credentials.user
  const password = credentials.password ?? credentials.pass
  return { username: username ?? '', password: password ?? '' }
}

/**
 * Resolve credentials for a call: explicit per-call value, then the client's
 * configured token / email+password, then the `SURGE_TOKEN` environment
 * variable. Returns null when nothing is configured (public endpoints).
 */
export function resolveCredentials(
  override: Credentials | undefined,
  fallback: { token?: string; email?: string; password?: string } | undefined,
): Credentials | null {
  if (override !== undefined) return override
  if (fallback?.token) return fallback.token
  if (fallback?.email && fallback.password) {
    return { username: fallback.email, password: fallback.password }
  }
  const env = process.env['SURGE_TOKEN']
  if (env) return env
  return null
}
