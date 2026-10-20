import type { ClientOptions } from './types/client.js'
import type { Credentials, PlatformStats } from './types/index.js'
import type { PublishOptions, StreamOptions } from './types/stream.js'
import type { StreamHandle } from './stream/handle.js'
import { RequestContext } from './core/context.js'
import {
  AccountResource,
  AuthResource,
  TokensResource,
} from './resources/account.js'
import { ProjectsResource } from './resources/projects.js'
import {
  CollaboratorsResource,
  DnsResource,
  SettingsResource,
  ZoneResource,
} from './resources/dns.js'
import { AnalyticsResource } from './resources/analytics.js'
import { BillingResource } from './resources/billing.js'
import { encrypt, ssl } from './stream/certs.js'
import { publish } from './stream/publish.js'

/**
 * The Surge API client. One instance holds an endpoint, credentials, and
 * transport configuration; every call resolves credentials in this order:
 *
 * 1. per-call override (`withCredentials` or a method's options),
 * 2. the client's `token` / `email`+`password`,
 * 3. the `SURGE_TOKEN` environment variable.
 */
export class SurgeClient {
  readonly account: AccountResource
  readonly auth: AuthResource
  readonly tokens: TokensResource
  readonly projects: ProjectsResource
  readonly dns: DnsResource
  readonly zone: ZoneResource
  readonly collaborators: CollaboratorsResource
  readonly settings: SettingsResource
  readonly analytics: AnalyticsResource
  readonly billing: BillingResource

  readonly #ctx: RequestContext
  readonly #options: ClientOptions

  constructor(options: ClientOptions = {}) {
    this.#options = options
    this.#ctx = new RequestContext(options)
    this.account = new AccountResource(this.#ctx)
    this.auth = new AuthResource(this.#ctx)
    this.tokens = new TokensResource(this.#ctx)
    this.projects = new ProjectsResource(this.#ctx)
    this.dns = new DnsResource(this.#ctx)
    this.zone = new ZoneResource(this.#ctx)
    this.collaborators = new CollaboratorsResource(this.#ctx)
    this.settings = new SettingsResource(this.#ctx)
    this.analytics = new AnalyticsResource(this.#ctx)
    this.billing = new BillingResource(this.#ctx)
  }

  /** The resolved base URL of the API this client talks to. */
  get endpoint(): string {
    return this.#ctx.endpoint
  }

  /**
   * A cloned client that uses the given credentials for every call.
   * The original client is untouched — ideal for tools managing several
   * Surge accounts.
   */
  withCredentials(credentials: Credentials): SurgeClient {
    const opts: ClientOptions = {
      ...this.#options,
      token: undefined,
      email: undefined,
      password: undefined,
    }
    if (typeof credentials === 'string') {
      opts.token = credentials
    } else {
      // `{ user: "token", pass }` and email+password both ride the same
      // fields: token auth is Basic auth with the literal username "token"
      opts.email = credentials.username ?? credentials.user
      opts.password = credentials.password ?? credentials.pass
    }
    return new SurgeClient(opts)
  }

  /** GET /stats — public platform statistics. No auth required. */
  stats(): Promise<PlatformStats> {
    return this.account.stats()
  }

  /**
   * Publish a directory (or a single HTML file) to a domain.
   *
   * Files are gathered (respecting `.surgeignore`), packed into a gzipped
   * tarball, and streamed to the API; the response is live NDJSON progress.
   * Upload dedupe ("carry") is used automatically for projects ≥ 1 MB.
   */
  publish(
    projectPath: string,
    domain: string,
    options: PublishOptions = {},
  ): StreamHandle {
    return publish(
      {
        endpoint: this.#ctx.endpoint,
        credentials: this.#ctx.credentialsFor(options.creds),
        sdkVersion: this.#ctx.sdkVersion,
        userAgent: this.#ctx.userAgent,
        fetchImpl: this.#ctx.fetchImpl,
      },
      projectPath,
      domain,
      options,
    )
  }

  /** PUT /:domain/encrypt — provision a managed SSL certificate. */
  encrypt(domain: string, options: StreamOptions = {}): StreamHandle {
    return encrypt(
      {
        endpoint: this.#ctx.endpoint,
        credentials: this.#ctx.credentialsFor(options.creds),
        sdkVersion: this.#ctx.sdkVersion,
        userAgent: this.#ctx.userAgent,
        fetchImpl: this.#ctx.fetchImpl,
      },
      domain,
      options,
    )
  }

  /** PUT /:domain/ssl — upload a custom PEM bundle (paid plans). */
  ssl(
    pemPath: string,
    domain: string,
    options: StreamOptions = {},
  ): StreamHandle {
    return ssl(
      {
        endpoint: this.#ctx.endpoint,
        credentials: this.#ctx.credentialsFor(options.creds),
        sdkVersion: this.#ctx.sdkVersion,
        userAgent: this.#ctx.userAgent,
        fetchImpl: this.#ctx.fetchImpl,
      },
      pemPath,
      domain,
      options,
    )
  }
}

/**
 * Create a Surge API client.
 *
 * ```ts
 * import { createClient } from 'surgejs-sdk'
 *
 * const client = createClient({ token: process.env.SURGE_TOKEN })
 * const projects = await client.projects.list()
 * const handle = client.publish('./dist', 'my-site.surge.sh', {
 *   message: 'ci deploy',
 * })
 * await handle.completed
 * ```
 */
export function createClient(options: ClientOptions = {}): SurgeClient {
  return new SurgeClient(options)
}
