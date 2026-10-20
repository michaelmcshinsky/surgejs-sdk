/**
 * Documented Surge platform facts tools commonly need: DNS targets, service
 * limits, rate limits, and the preview-URL format. Values come from the
 * official docs (surge.sh/docs) — they change rarely, but treat them as
 * guidance, not enforcement: the server has the final word.
 */

/** Surge's authoritative name servers, for domains delegated to Surge. */
export const SURGE_NAME_SERVERS: readonly string[] = [
  'ns1.surge.world',
  'ns2.surge.world',
  'ns3.surge.world',
  'ns4.surge.world',
]

/** CNAME target for geo-aware routing at an existing DNS provider. */
export const SURGE_CNAME_TARGET: string = 'geo.surge.world'

/** A record for apex domains at providers without ALIAS-style records (pins one region). */
export const SURGE_A_RECORD: string = '138.197.235.123'

/** Nameserver domain Surge manages when a domain is delegated. */
export const SURGE_NS_DOMAIN: string = 'surge.world'

/** Everything a DNS-provisioning tool needs to point a domain at Surge. */
export const SURGE_DNS: {
  readonly nameServers: readonly string[]
  readonly cname: string
  readonly a: string
  readonly nsDomain: string
} = {
  nameServers: SURGE_NAME_SERVERS,
  cname: SURGE_CNAME_TARGET,
  a: SURGE_A_RECORD,
  nsDomain: SURGE_NS_DOMAIN,
}

/** Documented project limits (enforced server-side on publish). */
export const PROJECT_LIMITS: {
  readonly maxFiles: number
  readonly maxBytes: number
} = {
  /** Maximum files in one project. */
  maxFiles: 10_100,
  /** Maximum total project size in bytes (450 MB). */
  maxBytes: 450 * 1000 * 1000,
}

/**
 * Documented publish rate limits per 15-minute window.
 * Halved for unverified accounts — verify early.
 */
export const PUBLISH_RATE_LIMITS: {
  readonly perDomain: number
  readonly perAccount: number
  readonly perIp: number
  readonly windowMinutes: number
} = {
  perDomain: 30,
  perAccount: 60,
  perIp: 240,
  windowMinutes: 15,
}

/**
 * Check a project against the documented platform limits.
 * Returns a human-readable refusal, or null when it fits.
 */
export function limitViolation(fileCount: number, bytes: number): string | null {
  if (fileCount > PROJECT_LIMITS.maxFiles) {
    return `project has ${fileCount} files; the platform limit is ${PROJECT_LIMITS.maxFiles}`
  }
  if (bytes > PROJECT_LIMITS.maxBytes) {
    return `project is ${bytes} bytes; the platform limit is ${PROJECT_LIMITS.maxBytes} (450 MB)`
  }
  return null
}

/**
 * The permanent preview URL of a revision: `<rev>-<domain>`.
 * Every revision keeps this URL for life, served from the same CDN.
 */
export function previewUrl(rev: string | number, domain: string): string {
  return `${rev}-${domain}`
}

const DOMAIN_RE =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i

/**
 * Conservative domain-shape check (labels, no spaces, at least one dot).
 * Not a DNS lookup — syntax only, mirroring what the CLI accepts as a
 * domain target.
 */
export function isValidDomain(value: string): boolean {
  if (!value || value.length > 253) return false
  if (value.endsWith('.')) return false
  return DOMAIN_RE.test(value)
}
