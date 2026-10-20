import type {
  Account,
  LoginPollResult,
  LoginSession,
  MfaSession,
  MintedToken,
  PlatformStats,
  RequestOptions,
  SessionCredentials,
  TokenInfo,
  VerificationResult,
} from '../types/index.js'
import type { RequestContext } from '../core/context.js'

/**
 * Account & platform-statistics operations.
 *
 * `stats` is public and unauthenticated; everything else needs credentials.
 */
export class AccountResource {
  constructor(private readonly ctx: RequestContext) {}

  /** GET /account — fetch the account: email, verification, plan, card. */
  get(options: RequestOptions = {}): Promise<Account> {
    return this.ctx.call<Account>('GET', '/account', options)
  }

  /** POST /verification — send an email-verification link. */
  verify(options: RequestOptions = {}): Promise<VerificationResult> {
    return this.ctx.call<VerificationResult>('POST', '/verification', {
      ...options,
      body: {},
    })
  }

  /**
   * DELETE /account — permanently delete the account.
   * Fails with 409 while projects still exist.
   */
  nuke(options: RequestOptions = {}): Promise<unknown> {
    return this.ctx.call<unknown>('DELETE', '/account', options)
  }

  /** GET /stats — public platform statistics. No auth required. */
  stats(options: RequestOptions = {}): Promise<PlatformStats> {
    return this.ctx.call<PlatformStats>('GET', '/stats', {
      ...options,
      auth: false,
    })
  }
}

/**
 * Authentication operations: token minting, password reset, browser-handoff
 * login, and the two-factor-auth ceremony.
 */
export class AuthResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * POST /token — exchange email + password for a long-lived token.
   *
   * Signing in with an email that has no account **creates the account** —
   * the same behavior as `surge login` in the CLI. The returned credentials
   * are ready to pass to any other method.
   */
  async login(
    email: string,
    password: string,
    options: RequestOptions = {},
  ): Promise<{ email: string; token: string; credentials: SessionCredentials }> {
    const result = await this.ctx.call<MintedToken>('POST', '/token', {
      ...options,
      body: {},
      creds: { username: email, password },
    })
    return {
      email: result.email ?? email,
      token: result.token,
      credentials: { user: 'token', pass: result.token },
    }
  }

  /**
   * POST /token — mint a token with extra args (scope, message); returns the
   * server's full response instead of the login-shaped credentials.
   */
  mintToken(
    args: Record<string, unknown> = {},
    options: RequestOptions = {},
  ): Promise<MintedToken> {
    return this.ctx.call<MintedToken>('POST', '/token', {
      ...options,
      body: args,
    })
  }

  /** POST /token/reset/:email — send password-reset instructions. No auth. */
  resetPassword(email: string, options: RequestOptions = {}): Promise<unknown> {
    return this.ctx.call<unknown>(
      'POST',
      `/token/reset/${encodeURIComponent(email)}`,
      { ...options, body: {}, auth: false },
    )
  }

  /**
   * POST /login/session — open a device session for browser-handoff login.
   * No auth: this IS the login. Poll the returned uuid for approval.
   */
  createLoginSession(
    host: string,
    options: RequestOptions = {},
  ): Promise<LoginSession> {
    return this.ctx.call<LoginSession>('POST', '/login/session', {
      ...options,
      body: { host },
      auth: false,
    })
  }

  /**
   * POST /login/session/:uuid/poll — poll a browser-login session.
   * Always 200: `pending`, `approved` (token rides once), or `gone`.
   */
  pollLoginSession(
    uuid: string,
    poll: number,
    options: RequestOptions = {},
  ): Promise<LoginPollResult> {
    return this.ctx.call<LoginPollResult>(
      'POST',
      `/login/session/${encodeURIComponent(uuid)}/poll`,
      { ...options, body: { poll }, auth: false },
    )
  }

  /**
   * POST /mfa/session — open the browser ceremony that sets up or manages
   * two-factor auth. The page runs the whole ceremony.
   */
  createMfaSession(options: RequestOptions = {}): Promise<MfaSession> {
    return this.ctx.call<MfaSession>('POST', '/mfa/session', {
      ...options,
      body: {},
    })
  }
}

/**
 * API-token management (`surge tokens …`).
 *
 * Tokens are shown once at mint time; scope one to a domain to limit the
 * blast radius of a leaked CI secret.
 */
export class TokensResource {
  constructor(private readonly ctx: RequestContext) {}

  /** GET /tokens — every token on the account. */
  list(options: RequestOptions = {}): Promise<TokenInfo[]> {
    return this.ctx.call<TokenInfo[]>('GET', '/tokens', options)
  }

  /**
   * POST /token — mint a token (same endpoint as login; args carry scope).
   * The token is shown once — capture it now.
   */
  add(
    args: { domain?: string; message?: string } = {},
    options: RequestOptions = {},
  ): Promise<MintedToken> {
    return this.ctx.call<MintedToken>('POST', '/token', {
      ...options,
      body: args,
    })
  }

  /** DELETE /tokens/:id — expire a token by its `tok-` id. */
  remove(id: string, options: RequestOptions = {}): Promise<unknown> {
    return this.ctx.call<unknown>(
      'DELETE',
      `/tokens/${encodeURIComponent(id)}`,
      options,
    )
  }
}
