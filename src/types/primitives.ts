/**
 * Credentials accepted by the Surge API (HTTP Basic under the hood).
 *
 * - A bare string is shorthand for `{ user: "token", pass: "<token>" }`.
 * - `{ user }` / `{ username }` and `{ pass }` / `{ password }` are aliases.
 * - Email + password is only needed to mint a token (`client.auth.login`).
 */
export type Credentials =
  | string
  | {
      user?: string
      pass?: string
      username?: string
      password?: string
    }

/** Normalized Basic-auth pair. */
export interface BasicAuth {
  username: string
  password: string
}

/** Per-request knobs available on every JSON method. */
export interface RequestOptions {
  /** Abort the underlying request. */
  signal?: AbortSignal
  /** Override the client's credentials for this call only. */
  creds?: Credentials
  /** Extra HTTP headers merged over the defaults. */
  headers?: Record<string, string>
}
