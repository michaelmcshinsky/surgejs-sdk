import type {
  DnsRecord,
  InviteResult,
  ProjectSettings,
  RequestOptions,
  RevokeResult,
  Zone,
  ZoneRecord,
} from '../types/index.js'
import type { RequestContext } from '../core/context.js'
import { requireDomain } from './projects.js'

/**
 * Custom DNS records for apex domains delegated to Surge's name servers.
 * On other domains these endpoints respond 405.
 */
export class DnsResource {
  constructor(private readonly ctx: RequestContext) {}

  /** GET /:domain/dns — the custom records you've added. */
  list(domain: string, options: RequestOptions = {}): Promise<DnsRecord[]> {
    return this.ctx.call<DnsRecord[]>(
      'GET',
      `/${requireDomain(domain)}/dns`,
      options,
    )
  }

  /** POST /:domain/dns — add a record. 400 on validation failure. */
  add(
    domain: string,
    record: Omit<DnsRecord, 'id'>,
    options: RequestOptions = {},
  ): Promise<unknown> {
    return this.ctx.call<unknown>('POST', `/${requireDomain(domain)}/dns`, {
      ...options,
      body: record,
    })
  }

  /** DELETE /:domain/dns/:id — remove a record by id. */
  remove(
    domain: string,
    id: string | number,
    options: RequestOptions = {},
  ): Promise<unknown> {
    return this.ctx.call<unknown>(
      'DELETE',
      `/${requireDomain(domain)}/dns/${encodeURIComponent(String(id))}`,
      options,
    )
  }
}

/**
 * The full zone, including records Surge manages automatically.
 * Same record shape as DNS, with ids on every entry.
 */
export class ZoneResource {
  constructor(private readonly ctx: RequestContext) {}

  /** GET /:domain/zone — the complete zone. */
  list(domain: string, options: RequestOptions = {}): Promise<Zone> {
    return this.ctx.call<Zone>(
      'GET',
      `/${requireDomain(domain)}/zone`,
      options,
    )
  }

  /** POST /:domain/zone — add a zone record. */
  add(
    domain: string,
    record: Omit<ZoneRecord, 'id'>,
    options: RequestOptions = {},
  ): Promise<unknown> {
    return this.ctx.call<unknown>('POST', `/${requireDomain(domain)}/zone`, {
      ...options,
      body: record,
    })
  }

  /** DELETE /:domain/zone/:id — remove a zone record by id. */
  remove(
    domain: string,
    id: string | number,
    options: RequestOptions = {},
  ): Promise<unknown> {
    return this.ctx.call<unknown>(
      'DELETE',
      `/${requireDomain(domain)}/zone/${encodeURIComponent(String(id))}`,
      options,
    )
  }
}

/** Collaborators — people who may publish to a project. */
export class CollaboratorsResource {
  constructor(private readonly ctx: RequestContext) {}

  /** POST /:domain/collaborators — invite collaborators by email. */
  invite(
    domain: string,
    emails: string[] | string,
    options: RequestOptions = {},
  ): Promise<InviteResult> {
    const list = Array.isArray(emails) ? emails : [emails]
    return this.ctx.call<InviteResult>(
      'POST',
      `/${requireDomain(domain)}/collaborators`,
      { ...options, body: { emails: list } },
    )
  }

  /** DELETE /:domain/collaborators — revoke collaborators immediately. */
  revoke(
    domain: string,
    emails: string[] | string,
    options: RequestOptions = {},
  ): Promise<RevokeResult> {
    const list = Array.isArray(emails) ? emails : [emails]
    return this.ctx.call<RevokeResult>(
      'DELETE',
      `/${requireDomain(domain)}/collaborators`,
      { ...options, body: { emails: list } },
    )
  }
}

/** Project platform settings — force HTTPS, private, redirects, CORS, cache, HSTS, TTL. */
export class SettingsResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * PUT /:domain/settings — update settings; the response echoes the
   * resulting configuration. Pass `null` on a key to clear it to default;
   * an empty object echoes the current config (the CLI's `config` view).
   */
  update(
    domain: string,
    props: Partial<ProjectSettings>,
    options: RequestOptions = {},
  ): Promise<ProjectSettings> {
    return this.ctx.call<ProjectSettings>(
      'PUT',
      `/${requireDomain(domain)}/settings`,
      { ...options, body: props },
    )
  }
}
