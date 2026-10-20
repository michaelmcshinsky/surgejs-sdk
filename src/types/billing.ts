import type { Card, Plan } from './account.js'

/** GET /plans (or /:domain/plans) reply. */
export interface PlansResponse {
  stripe_pk?: string
  current?: Plan | null
  list?: Plan[]
  message?: string
  card?: Card | null
  type?: string
  perks?: string[]
}

/** PUT /plan body — subscribe to or change a plan. */
export interface PlanChangeArgs {
  plan: string
  /** Stripe source token when changing payment at the same time. */
  token?: string
  timestamp?: string
}

/** GET /subscription (account- or project-scoped) reply. */
export interface Subscription {
  type?: string
  stripe_pk?: string
  plan?: Plan | null
  card?: Card | null
  perks?: string[]
}

/** POST /upgrade/link and POST /billing/link reply. */
export interface LinkResponse {
  url: string
}

/** PUT /card body. */
export interface CardArgs {
  /** A Stripe source token. */
  token: string
}
