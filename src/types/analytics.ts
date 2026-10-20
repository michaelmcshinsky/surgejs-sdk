/** Aggregated traffic analytics for the past 14 days (GET /:domain/analytics). */
export interface Analytics {
  normalizedAt?: string
  normalizedAtInWords?: string
  version?: string
  domain?: string
  range?: string[]
  traffic?: {
    connections?: unknown
    visits?: unknown
    uniques?: unknown
  }
  encryption?: {
    cE?: unknown
    cU?: unknown
    cRe?: unknown
    cRu?: unknown
  }
  bandwidth?: {
    all?: unknown
    body?: unknown
    headers?: unknown
  }
  cache?: {
    hit?: unknown
    miss?: unknown
  }
  source?: Record<string, unknown>
  device?: Record<string, unknown>
  os?: Record<string, unknown>
  browser?: Record<string, unknown>
  success?: Record<string, unknown>
  fail?: Record<string, unknown>
  redirect?: Record<string, unknown>
  load?: Record<string, unknown>
  datacenters?: Record<string, unknown>
}

/** Bandwidth usage (GET /:domain/usage) — same data source as analytics. */
export type Usage = Analytics

/** Per-edge-node state of a project (GET /:domain/audit). */
export interface AuditNode {
  rev?: string | number
  manifest?: Record<string, { size: number; md5: string }>
  cert?: Record<string, unknown>
}

/** Map of host → node state. */
export type Audit = Record<string, AuditNode>
