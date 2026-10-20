/** Subscription plan attached to an account or project. */
export interface Plan {
  id?: string
  name: string
  amount?: string | number
  friendly?: string
  dummy?: boolean
  current?: boolean
  metadata?: Record<string, unknown>
  ext?: string
  perks?: string[]
  comped?: boolean
  interval?: string
  interval_count?: number
  trial_period_days?: number | null
  usage_type?: string
  nickname?: string | null
}

/** Payment card on file (a subset of the Stripe source object). */
export interface Card {
  id?: string
  brand?: string
  last4?: string
  exp_month?: number
  exp_year?: number
}

/** The authenticated account (GET /account). */
export interface Account {
  email: string
  email_verified_at?: string | null
  created_at?: string
  updated_at?: string
  role?: number
  plan?: Plan | null
  card?: Card | null
  /** Legacy/optional identifiers present on some accounts. */
  id?: string
  uuid?: string
  payment_id?: string | null
}

/** Public platform statistics (GET /stats). Unauthenticated. */
export interface PlatformStats {
  calls: string
  deployments: string
  /** Server typo kept for wire compatibility. */
  deployemnts?: string
  bytes: string
  files: string
  accounts: string
  projects: string
  builds: string
  formatted: {
    calls: string
    deployments: string
    bytes: string
    files: string
    accounts: string
    projects: string
    builds: string
  }
}

/** Response from POST /token (both login-mint and tokens-add flows). */
export interface MintedToken {
  email?: string
  token: string
  id?: string
  msg?: string
  message?: string
  scope?: string | null
  domain?: string | null
  uses?: number | null
  created_at?: string
  last_used_at?: string | null
}

/** A token listed by GET /tokens. */
export interface TokenInfo {
  id: string
  scope?: string | null
  message?: string | null
  uses?: number | null
  created_at?: string
  last_used_at?: string | null
}

/** Credentials ready to pass to any method after a login/mint. */
export interface SessionCredentials {
  user: 'token'
  pass: string
}

/** POST /login/session — browser-handoff login, stage 1. */
export interface LoginSession {
  uuid: string
  host?: string
  code?: string
  url?: string
}

/** POST /login/session/:uuid/poll — always 200 with one of these shapes. */
export type LoginPollResult =
  | { status: 'pending'; poll?: number }
  | { status: 'approved'; token: string; email?: string }
  | { status: 'gone'; msg?: string }

/** POST /mfa/session — opens the browser ceremony for two-factor auth. */
export interface MfaSession {
  url?: string
}

/** POST /verification replies depending on state. */
export type VerificationResult =
  | { verified: true }
  | { verified: false; sent: true }
  | { verified: false; sent: false; msg?: string }
