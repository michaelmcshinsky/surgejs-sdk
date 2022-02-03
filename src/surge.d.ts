interface Options {
  username: string;
  password: string;
}

interface Headers {
  version: string;
  'file-count': string;
  cmd: string;
  'project-size': string;
  timestamp: string;
}

interface Login {
  email: string;
  token: string;
};

interface Account {
  email: string;
  id: string;
  role: number;
  updated_at: string;
  created_at: string;
  email_verified_at: string;
  payment_id?: string;
  plan: AccountPlan;
  card?: any;
};

interface AccountPlan {
  id: string;
  name: string;
  amount: string;
  friendly: string;
  dummy: boolean;
  current: boolean;
  metadata: AccountPlanMetaData;
  ext: string;
  perks: string[];
};

interface AccountPlanMetaData {
  type: string;
};

interface Stats {
  calls: string;
  deployemnts: string;
  bytes: string;
  files: string;
  accounts: string;
  projects: string;
  builds: string;
  deployments: string;
  formatted: StatsFormatted;
};

interface StatsFormatted {
  calls: string;
  deployments: string;
  bytes: string;
  files: string;
  accounts: string;
  projects: string;
  builds: string;
};

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
};

interface Teardown {
  msg: string;
  nsDomain: string;
  regions: string[];
  servers: string[];
};
