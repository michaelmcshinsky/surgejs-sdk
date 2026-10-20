import type {
  CachePurgeResult,
  Certificate,
  DeployMetadata,
  DomainStatus,
  Manifest,
  ProjectSummary,
  RequestOptions,
  Revision,
  RevisionChangeResult,
  TeardownResult,
} from '../types/index.js'
import type { RequestContext } from '../core/context.js'

/** Ensure a domain is present before building a path. */
export function requireDomain(domain: string | undefined | null): string {
  if (!domain) throw new TypeError('domain must be present')
  return domain
}

/**
 * Projects & revisions: listing, teardown, revision navigation, cache purge,
 * metadata/manifest, status, and certificates.
 */
export class ProjectsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * GET /list — all projects on the account.
   * With a domain: GET /:domain/list — all revisions of one project.
   */
  list(options?: RequestOptions): Promise<ProjectSummary[]>
  list(domain: string, options?: RequestOptions): Promise<Revision[]>
  list(
    domainOrOptions?: string | RequestOptions,
    maybeOptions: RequestOptions = {},
  ): Promise<ProjectSummary[] | Revision[]> {
    if (typeof domainOrOptions === 'string') {
      return this.ctx.call<Revision[]>(
        'GET',
        `/${requireDomain(domainOrOptions)}/list`,
        maybeOptions,
      )
    }
    return this.ctx.call<ProjectSummary[]>('GET', '/list', domainOrOptions ?? {})
  }

  /** GET /:domain/list — revisions of the project (alias of list(domain)). */
  revisions(domain: string, options: RequestOptions = {}): Promise<Revision[]> {
    return this.ctx.call<Revision[]>(
      'GET',
      `/${requireDomain(domain)}/list`,
      options,
    )
  }

  /** DELETE /:domain — take the project down and remove it. */
  teardown(domain: string, options: RequestOptions = {}): Promise<TeardownResult> {
    return this.ctx.call<TeardownResult>(
      'DELETE',
      `/${requireDomain(domain)}`,
      options,
    )
  }

  /** POST /:domain/rollback — serve the previous revision. */
  rollback(
    domain: string,
    options: RequestOptions = {},
  ): Promise<RevisionChangeResult> {
    return this.ctx.call<RevisionChangeResult>(
      'POST',
      `/${requireDomain(domain)}/rollback`,
      { ...options, body: {} },
    )
  }

  /** POST /:domain/rollfore — serve the next revision. */
  rollfore(
    domain: string,
    options: RequestOptions = {},
  ): Promise<RevisionChangeResult> {
    return this.ctx.call<RevisionChangeResult>(
      'POST',
      `/${requireDomain(domain)}/rollfore`,
      { ...options, body: {} },
    )
  }

  /**
   * PUT /:domain/rev — cut over to the latest revision, or PUT
   * /:domain/rev/:rev to a specific one. Ships previews to production.
   */
  cutover(
    domain: string,
    rev?: string | number,
    options: RequestOptions = {},
  ): Promise<unknown> {
    const d = requireDomain(domain)
    const path = rev === undefined || rev === null ? `/${d}/rev` : `/${d}/rev/${rev}`
    return this.ctx.call<unknown>('PUT', path, { ...options, body: {} })
  }

  /**
   * DELETE /:domain/rev/:rev — discard a revision from the system.
   * If it was live, production moves to a neighboring revision; discarding
   * the last revision takes the project offline.
   */
  discard(
    domain: string,
    rev?: string | number,
    options: RequestOptions = {},
  ): Promise<unknown> {
    const d = requireDomain(domain)
    const path = rev === undefined || rev === null ? `/${d}/rev` : `/${d}/rev/${rev}`
    return this.ctx.call<unknown>('DELETE', path, options)
  }

  /** DELETE /:domain/cache — purge the project from every edge node. */
  bust(domain: string, options: RequestOptions = {}): Promise<CachePurgeResult> {
    return this.ctx.call<CachePurgeResult>(
      'DELETE',
      `/${requireDomain(domain)}/cache`,
      options,
    )
  }

  /** GET /:domain/metadata.json — deploy metadata for the live revision. */
  metadata(domain: string, options?: RequestOptions): Promise<DeployMetadata>
  /** GET /:domain/:rev/metadata.json — metadata for a specific revision. */
  metadata(
    domain: string,
    rev: string | number,
    options?: RequestOptions,
  ): Promise<DeployMetadata>
  metadata(
    domain: string,
    revOrOptions?: string | number | RequestOptions,
    maybeOptions: RequestOptions = {},
  ): Promise<DeployMetadata> {
    const d = requireDomain(domain)
    if (revOrOptions !== undefined && typeof revOrOptions !== 'object') {
      return this.ctx.call<DeployMetadata>(
        'GET',
        `/${d}/${revOrOptions}/metadata.json`,
        maybeOptions,
      )
    }
    return this.ctx.call<DeployMetadata>('GET', `/${d}/metadata.json`, {
      ...(revOrOptions as RequestOptions | undefined),
    })
  }

  /** GET /:domain/manifest.json — path → { size, md5 } for the live revision. */
  manifest(domain: string, options?: RequestOptions): Promise<Manifest>
  /** GET /:domain/:rev/manifest.json — manifest for a specific revision. */
  manifest(
    domain: string,
    rev: string | number,
    options?: RequestOptions,
  ): Promise<Manifest>
  manifest(
    domain: string,
    revOrOptions?: string | number | RequestOptions,
    maybeOptions: RequestOptions = {},
  ): Promise<Manifest> {
    const d = requireDomain(domain)
    if (revOrOptions !== undefined && typeof revOrOptions !== 'object') {
      return this.ctx.call<Manifest>(
        'GET',
        `/${d}/${revOrOptions}/manifest.json`,
        maybeOptions,
      )
    }
    return this.ctx.call<Manifest>('GET', `/${d}/manifest.json`, {
      ...(revOrOptions as RequestOptions | undefined),
    })
  }

  /** GET /:domain/status — one status word and the next action, if any. */
  status(domain: string, options: RequestOptions = {}): Promise<DomainStatus> {
    return this.ctx.call<DomainStatus>(
      'GET',
      `/${requireDomain(domain)}/status`,
      options,
    )
  }

  /** GET /:domain/certs — certificate information for the domain. */
  certs(domain: string, options: RequestOptions = {}): Promise<Certificate> {
    return this.ctx.call<Certificate>(
      'GET',
      `/${requireDomain(domain)}/certs`,
      options,
    )
  }
}
