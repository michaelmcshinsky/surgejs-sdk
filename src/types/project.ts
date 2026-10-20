/** A project on the account (entries of GET /list). */
export interface ProjectSummary {
  domain: string
  rev?: string | number
  planName?: string
  message?: string | null
  email?: string
  cliVersion?: string
  platform?: string
  cmd?: string
  ip?: string
  preview?: string
  timeAgoInWords?: string
  publicFileCount?: number
  publicTotalSize?: number
  privateFileCount?: number
  privateTotalSize?: number
  uploadStartTime?: number
  uploadEndTime?: number
  uploadDuration?: number
  buildTime?: string | null
  config?: Record<string, unknown>
  output?: Record<string, unknown>
}

/** A revision of a project (entries of GET /:domain/list). */
export interface Revision {
  rev: string | number
  friendlySize?: string
  timeAgoInWords?: string
  publicFileCount?: number
  publicTotalSize?: number
  message?: string | null
  email?: string
  preview?: string
  live?: boolean
}

/** Deploy metadata (GET /:domain/metadata.json). */
export interface DeployMetadata {
  rev: string | number
  message?: string | null
  email?: string
  publicFileCount?: number
  publicTotalSize?: number
  privateFileCount?: number
  privateTotalSize?: number
  preview?: string
  timeAgoInWords?: string
  config?: Record<string, unknown>
  uploadStartTime?: number
  uploadEndTime?: number
  uploadDuration?: number
  cliVersion?: string
  cmd?: string
  platform?: string
  ip?: string
}

/** One entry of the file manifest (GET /:domain/manifest.json). */
export interface ManifestEntry {
  size: number
  md5: string
}

/** Map of path → { size, md5 } for every file in a revision. */
export type Manifest = Record<string, ManifestEntry>

/** DELETE /:domain reply. */
export interface TeardownResult {
  msg: string
  nsDomain?: string
  regions?: Record<string, unknown> | string[]
  servers?: unknown[]
}

/** POST /:domain/rollback and /rollfore reply. */
export interface RevisionChangeResult {
  revision?: string | number
  former?: string | number
  instances?: unknown[]
}

/** DELETE /:domain/cache reply. */
export interface CachePurgeResult {
  confirmed: string[]
  unconfirmed: string[]
}

/** A custom DNS record. */
export interface DnsRecord {
  id?: string | number
  type: string
  name: string
  value: string
  priority?: string | number
}

/** A zone record — a DNS record as managed in the full zone. */
export interface ZoneRecord extends DnsRecord {
  id: string | number
  managed?: boolean
}

/** The domain's complete zone (GET /:domain/zone). */
export type Zone = ZoneRecord[]

/** GET /:domain/status — one status word plus the user's next move. */
export interface DomainStatus {
  status: 'waiting on dns' | 'securing' | 'live' | (string & {})
  action?: string
  https?: boolean
  reason?: string
  records?: DnsRecord[]
  evidence?: unknown
}

/** Certificate details (GET /:domain/certs, and inside deploy info). */
export interface Certificate {
  subject?: Record<string, string> | string
  issuer?: Record<string, string> | string
  subjectaltname?: string
  altnames?: string[]
  valid_from?: string
  valid_to?: string
  expiresInWords?: string
  fingerprint?: string
  serialNumber?: string
  autoRenew?: boolean
}

/** Project platform settings (PUT /:domain/settings). */
export interface ProjectSettings {
  /** 'http' | 'https' — redirect all traffic to one protocol. */
  force?: string | null
  /** Redirect the whole project to another domain. */
  redirect?: string | null
  /** CORS origin, or '*'. Gated by plan. */
  cors?: string | null
  /** 'strict' | 'casual' — CDN cache posture. */
  cache?: string | null
  /** HSTS max-age in seconds. */
  hsts?: number | string | null
  /** CDN TTL in seconds. */
  ttl?: number | string | null
  /**
   * Require sign-in for the whole domain. Collaborators get in; everyone
   * else meets the sign-in page, and crawlers get a Disallow robots.txt.
   * Available on every plan. `null` clears back to public.
   */
  private?: boolean | null
}
