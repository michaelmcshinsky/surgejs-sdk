import type {
  Card,
  CardArgs,
  LinkResponse,
  PlanChangeArgs,
  PlansResponse,
  RequestOptions,
  Subscription,
} from '../types/index.js'
import type { RequestContext } from '../core/context.js'

/**
 * Billing: plans, subscription changes, cards, and Stripe browser links.
 *
 * The `plan`/`card`/`upgradeLink`/`billingLink` endpoints mint 48-hour
 * checkout and portal URLs so card data never touches this SDK.
 */
export class BillingResource {
  constructor(private readonly ctx: RequestContext) {}

  /**
   * GET /plans — available plans, the current plan, and card status.
   * With a domain: GET /:domain/plans — scoped to a project's paywall.
   */
  plans(options?: RequestOptions): Promise<PlansResponse>
  plans(domain: string, options?: RequestOptions): Promise<PlansResponse>
  plans(
    domainOrOptions?: string | RequestOptions,
    maybeOptions: RequestOptions = {},
  ): Promise<PlansResponse> {
    if (typeof domainOrOptions === 'string') {
      return this.ctx.call<PlansResponse>(
        'GET',
        `/${domainOrOptions}/plans`,
        maybeOptions,
      )
    }
    return this.ctx.call<PlansResponse>('GET', '/plans', domainOrOptions ?? {})
  }

  /** PUT /plan (or /:domain/plan) — subscribe to or change a plan. */
  setPlan(args: PlanChangeArgs, options?: RequestOptions): Promise<unknown>
  setPlan(
    domain: string,
    args: PlanChangeArgs,
    options?: RequestOptions,
  ): Promise<unknown>
  setPlan(
    domainOrArgs: string | PlanChangeArgs,
    argsOrOptions?: PlanChangeArgs | RequestOptions,
    maybeOptions: RequestOptions = {},
  ): Promise<unknown> {
    if (typeof domainOrArgs === 'string') {
      return this.ctx.call<unknown>('PUT', `/${domainOrArgs}/plan`, {
        ...maybeOptions,
        body: argsOrOptions as PlanChangeArgs,
      })
    }
    return this.ctx.call<unknown>('PUT', '/plan', {
      ...(argsOrOptions as RequestOptions | undefined),
      body: domainOrArgs,
    })
  }

  /** GET /subscription — the account's subscription state. */
  subscription(options?: RequestOptions): Promise<Subscription>
  /** GET /:domain/subscription — the project's paywall payload. */
  subscription(domain: string, options?: RequestOptions): Promise<Subscription>
  subscription(
    domainOrOptions?: string | RequestOptions,
    maybeOptions: RequestOptions = {},
  ): Promise<Subscription> {
    if (typeof domainOrOptions === 'string') {
      return this.ctx.call<Subscription>(
        'GET',
        `/${domainOrOptions}/subscription`,
        maybeOptions,
      )
    }
    return this.ctx.call<Subscription>('GET', '/subscription', domainOrOptions ?? {})
  }

  /** PUT /card — update the payment card with a Stripe source token. */
  setCard(args: CardArgs, options: RequestOptions = {}): Promise<Card> {
    return this.ctx.call<Card>('PUT', '/card', { ...options, body: args })
  }

  /** POST /upgrade/link — mint a browser checkout URL (valid 48 hours). */
  upgradeLink(options?: RequestOptions): Promise<LinkResponse>
  upgradeLink(plan: string, options?: RequestOptions): Promise<LinkResponse>
  upgradeLink(
    planOrOptions?: string | RequestOptions,
    maybeOptions: RequestOptions = {},
  ): Promise<LinkResponse> {
    if (typeof planOrOptions === 'string') {
      return this.ctx.call<LinkResponse>('POST', '/upgrade/link', {
        ...maybeOptions,
        body: { plan: planOrOptions },
      })
    }
    return this.ctx.call<LinkResponse>('POST', '/upgrade/link', {
      ...(planOrOptions as RequestOptions | undefined),
      body: {},
    })
  }

  /** POST /billing/link — mint a Stripe billing-portal URL (valid 48 hours). */
  billingLink(options: RequestOptions = {}): Promise<LinkResponse> {
    return this.ctx.call<LinkResponse>('POST', '/billing/link', {
      ...options,
      body: {},
    })
  }
}
