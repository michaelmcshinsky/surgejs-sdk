export interface SurgeOptions {
  username?: string;
  password?: string;
}

export interface Login {
  email: string;
  token: string;
}

export interface Account {
  email: string;
  id: string;
  role: number;
  updated_at: string;
  created_at: string;
  email_verified_at: string;
  payment_id?: string;
  plan: StudentPlan | ProfessionalPlan;
  card?: PaymentCard | null;
}

export interface PaymentCard {
  brand?: string;
  last4?: string;
  exp_month?: number;
  exp_year?: number;
  [key: string]: unknown;
}

export interface Plans {
  stripe_pk: string;
  current: StudentPlan | ProfessionalPlan | null;
  list: (StudentPlan | ProfessionalPlan)[];
  message: string;
}

export interface PlanMetadata {
  type: string;
}

export interface StudentPlan {
  id: string;
  name: string;
  amount: string;
  friendly: string;
  dummy: boolean;
  current: boolean;
  metadata: PlanMetadata;
  ext: string;
  perks: string[];
}

export interface ProfessionalPlan {
  id: string;
  object: string;
  active: boolean;
  aggregate_usage: null;
  amount: number;
  amount_decimal: string;
  billing_scheme: string;
  created: number;
  currency: string;
  interval: string;
  interval_count: number;
  livemode: boolean;
  metadata: PlanMetadata;
  name: string;
  nickname: string | null;
  product: null;
  tiers: null;
  tiers_mode: null;
  transform_usage: null;
  trial_period_days: number;
  usage_type: string;
  friendly: string;
  ext: string;
  perks: string[];
  comped: boolean;
  current: boolean;
}

export interface Stats {
  calls: string;
  deployments: string;
  bytes: string;
  files: string;
  accounts: string;
  projects: string;
  builds: string;
  formatted: FormattedStats;
}

export interface FormattedStats {
  calls: string;
  deployments: string;
  bytes: string;
  files: string;
  accounts: string;
  projects: string;
  builds: string;
}

export interface ProjectListEntry {
  domain: string;
  planName: string;
  output: Record<string, unknown> | null;
  rev: string;
  config: Record<string, unknown> | null;
  cmd: string;
  email: string;
  platform: string;
  cliVersion: string;
  message: string | null;
  buildTime: string | null;
  ip: string;
  privateFileList: string[];
  publicFileCount: number;
  publicTotalSize: number;
  privateFileCount: number;
  privateTotalSize: number;
  uploadStartTime: number;
  uploadEndTime: number;
  uploadDuration: number;
  preview: string;
  timeAgoInWords: string;
}

export interface Teardown {
  msg: string;
  nsDomain: string;
  regions: string[];
  servers: string[];
}

export interface Settings {
  force: Record<string, unknown> | null;
  redirect: Record<string, unknown> | null;
  cors: Record<string, unknown> | null;
  hsts: Record<string, unknown> | null;
  ttl: Record<string, unknown> | null;
}

export type MetricBreakdown = Record<string, number | string>;

export interface AnalyticsTraffic {
  connections: MetricBreakdown;
  visits: MetricBreakdown;
  uniques: MetricBreakdown;
}

export interface AnalyticsEncryption {
  cE: MetricBreakdown;
  cU: MetricBreakdown;
  cRe: MetricBreakdown;
  cRu: MetricBreakdown;
}

export interface AnalyticsBandwidth {
  all: MetricBreakdown;
  body: MetricBreakdown;
  headers: MetricBreakdown;
}

export interface AnalyticsCache {
  hit: MetricBreakdown;
  miss: MetricBreakdown;
}

export interface Analytics {
  normalizedAt: string;
  version: string;
  domain: string;
  range: string[];
  traffic: AnalyticsTraffic;
  encryption: AnalyticsEncryption;
  bandwidth: AnalyticsBandwidth;
  cache: AnalyticsCache;
  source: MetricBreakdown;
  device: MetricBreakdown;
  os: MetricBreakdown;
  browser: MetricBreakdown;
  success: MetricBreakdown;
  fail: MetricBreakdown;
  redirect: MetricBreakdown;
  load: MetricBreakdown;
  datacenters: MetricBreakdown;
  normalizedAtInWords: string;
}

export interface CertificateSubject {
  [key: string]: string;
}

export interface Certificate {
  subject: CertificateSubject;
  issuer: CertificateSubject;
  subjectaltname: string;
  infoAccess: Record<string, string[]>;
  modulus: string;
  exponent: string;
  valid_from: string;
  valid_to: string;
  fingerprint: string;
  ext_key_usage: string[];
  serialNumber: string;
  raw: {
    type: string;
    data: number[];
  };
}

export interface DomainDetails {
  rev: string;
  manifest: Record<string, unknown>;
  cert: Certificate | null;
}

export type AuditResponse = Record<string, DomainDetails>;

export interface CollaboratorInvite {
  email: string;
  role?: string;
}

export interface CollaboratorResponse {
  collaborators?: Array<{ email: string; role?: string }>;
  message?: string;
  [key: string]: unknown;
}

export interface CacheBustResponse {
  message?: string;
  [key: string]: unknown;
}

export interface CertsResponse {
  [key: string]: unknown;
  cert?: Certificate;
  certs?: Certificate[];
}

export type DnsRecordType = 'A' | 'AAAA' | 'ALIAS' | 'CNAME' | 'TXT' | 'MX' | 'NS' | 'SRV';

export interface DnsRecord {
  id: string | number;
  type: DnsRecordType | string;
  name: string;
  value: string;
  ttl?: number;
  priority?: number;
  [key: string]: unknown;
}

export type DnsResponse = DnsRecord[] | Record<string, DnsRecord[]>;

export interface DnsAddInput {
  type: DnsRecordType | string;
  name: string;
  value: string;
  ttl?: number;
  priority?: number;
}

export interface ZoneRecord {
  id: string | number;
  type?: string;
  name: string;
  value: string;
  ttl?: number;
  [key: string]: unknown;
}

export type ZoneResponse = ZoneRecord[] | Record<string, ZoneRecord[]>;

export interface ZoneAddInput {
  type?: string;
  name: string;
  value: string;
  ttl?: number;
}

export interface DeployHeaders {
  version: string;
  'file-count': string;
  cmd: string;
  'project-size': string;
  timestamp: string;
}

export interface DeployResponse {
  message?: string;
  [key: string]: unknown;
}

export interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}
