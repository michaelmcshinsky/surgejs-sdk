interface List {
  domain: string;
  planName: string;
  output: any;
  rev: string;
  config: any;
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

interface Teardown {
  msg: string;
  nsDomain: string;
  regions: string[];
  servers: string[];
}

interface Settings {
  force: any | null;
  redirect: any | null;
  cors: any | null;
  hsts: any | null;
  ttl: any | null;
}

interface Analytics {
  normalizedAt: string;
  version: string;
  domain: string;
  range: string[];
  traffic: AnalyticsTraffic;
  encryption: AnalyticsEncryption;
  bandwidth: AnalyticsBandwidth;
  cache: AnalyticsCache;
  source: ObjectString;
  device: ObjectString;
  os: ObjectString;
  browser: ObjectString;
  success: ObjectString;
  fail: ObjectString;
  redirect: ObjectString;
  load: ObjectString;
  datacenters: ObjectString;
  normalizedAtInWords: string;
}

interface AnalyticsTraffic {
  connections: any;
  visits: any;
  uniques: any;
}

interface AnalyticsEncryption {
  cE: any;
  cU: any;
  cRe: any;
  cRu: any;
}

interface AnalyticsBandwidth {
  all: any;
  body: any;
  headers: any;
}

interface AnalyticsCache {
  hit: any;
  miss: any;
}

interface ObjectString {
  [name: string]: any;
}

interface ObjectStringArray {
  [name: string]: string[];
}

interface Usage {
  [name: string]: DomainDetails;
}

interface DomainDetails {
  rev: string;
  manifest: ObjectString;
  cert: Certification;
}

interface Certification {
  subject: ObjectString;
  issuer: ObjectString;
  subjectaltname: string;
  infoAccess: ObjectStringArray;
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
