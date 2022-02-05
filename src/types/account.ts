interface Account {
  email: string;
  id: string;
  role: number;
  updated_at: string;
  created_at: string;
  email_verified_at: string;
  payment_id?: string;
  plan: StudentPlan | ProfessionalPlan;
  card?: any;
};

interface Plans {
  stripe_pk: string;
  current: null;
  list: (StudentPlan | ProfessionalPlan)[],
  message: string;
}

interface MetaData {
  type: string;
};

interface StudentPlan {
  id: string;
  name: string;
  amount: string;
  friendly: string;
  dummy: boolean;
  current: boolean;
  metadata: MetaData;
  ext: string;
  perks: string[];
};

interface ProfessionalPlan {
  id: string;
  object: string;
  active: boolean;
  aggregate_usage: null;
  ammount: number;
  amount_decimal: string;
  billing_scheme: string;
  created: number;
  currency: string;
  interval: string;
  interval_count: number;
  livemode: boolean;
  metadata: MetaData;
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
  current: false;
}

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