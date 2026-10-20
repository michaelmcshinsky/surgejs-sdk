import type {
  Analytics,
  Audit,
  RequestOptions,
  Usage,
} from '../types/index.js'
import type { RequestContext } from '../core/context.js'
import { requireDomain } from './projects.js'

/** Traffic analytics, bandwidth usage, and per-edge-node audit. */
export class AnalyticsResource {
  constructor(private readonly ctx: RequestContext) {}

  /** GET /:domain/analytics — traffic for the past 14 days. Cached 15 min. */
  get(domain: string, options: RequestOptions = {}): Promise<Analytics> {
    return this.ctx.call<Analytics>(
      'GET',
      `/${requireDomain(domain)}/analytics`,
      options,
    )
  }

  /** GET /:domain/usage — bandwidth usage (same source as analytics). */
  usage(domain: string, options: RequestOptions = {}): Promise<Usage> {
    return this.ctx.call<Usage>(
      'GET',
      `/${requireDomain(domain)}/usage`,
      options,
    )
  }

  /** GET /:domain/audit — per-edge-node state, incl. live TLS checks. */
  audit(domain: string, options: RequestOptions = {}): Promise<Audit> {
    return this.ctx.call<Audit>(
      'GET',
      `/${requireDomain(domain)}/audit`,
      options,
    )
  }
}
