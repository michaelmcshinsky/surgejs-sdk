import { SurgeClient } from './client';
import type {
  Account,
  Analytics,
  AuditResponse,
  CacheBustResponse,
  CertsResponse,
  CollaboratorInvite,
  CollaboratorResponse,
  DeployResponse,
  DnsAddInput,
  DnsRecord,
  DnsResponse,
  Login,
  Plans,
  ProjectListEntry,
  RequestOptions,
  Settings,
  Stats,
  SurgeOptions,
  Teardown,
  ZoneAddInput,
  ZoneRecord,
  ZoneResponse,
} from './types';

export class Surge {
  private client: SurgeClient;

  constructor(options: SurgeOptions = {}) {
    this.client = new SurgeClient(options);
  }

  init(options: SurgeOptions): void {
    this.client.setCredentials(options);
  }

  logout(): void {
    this.client.clearCredentials();
  }

  getCredentials(): Readonly<SurgeOptions> {
    return this.client.getCredentials();
  }

  async login(
    username?: string,
    password?: string,
    options?: RequestOptions
  ): Promise<Login> {
    if (username && password) {
      this.client.setCredentials({ username, password });
    }
    return this.client.request<Login>('POST', '/token', {}, undefined, options);
  }

  async resetPassword(email: string, options?: RequestOptions): Promise<void> {
    await this.client.request<void>('POST', `/token/reset/${encodeURIComponent(email)}`, undefined, undefined, options);
  }

  async account(options?: RequestOptions): Promise<Account> {
    return this.client.request<Account>('GET', '/account', undefined, undefined, options);
  }

  async stats(options?: RequestOptions): Promise<Stats> {
    return this.client.request<Stats>('GET', '/stats', undefined, undefined, options);
  }

  async cancel(options?: RequestOptions): Promise<unknown> {
    return this.client.request<unknown>('DELETE', '/account', undefined, undefined, options);
  }

  async list(options?: RequestOptions): Promise<ProjectListEntry[]> {
    return this.client.request<ProjectListEntry[]>('GET', '/list', undefined, undefined, options);
  }

  async inviteCollaborators(
    domain: string,
    data: CollaboratorInvite | CollaboratorInvite[],
    options?: RequestOptions
  ): Promise<CollaboratorResponse> {
    return this.client.request<CollaboratorResponse>(
      'POST',
      `/${encodeURIComponent(domain)}/collaborators`,
      data,
      undefined,
      options
    );
  }

  async revokeCollaborators(
    domain: string,
    emails: string[],
    options?: RequestOptions
  ): Promise<CollaboratorResponse> {
    return this.client.request<CollaboratorResponse>(
      'DELETE',
      `/${encodeURIComponent(domain)}/collaborators`,
      emails,
      undefined,
      options
    );
  }

  async cacheBust(domain: string, options?: RequestOptions): Promise<CacheBustResponse> {
    return this.client.request<CacheBustResponse>(
      'DELETE',
      `/${encodeURIComponent(domain)}/cache`,
      undefined,
      undefined,
      options
    );
  }

  async certs(domain: string, options?: RequestOptions): Promise<CertsResponse> {
    return this.client.request<CertsResponse>(
      'GET',
      `/${encodeURIComponent(domain)}/certs`,
      undefined,
      undefined,
      options
    );
  }

  async dns(domain: string, options?: RequestOptions): Promise<DnsResponse> {
    return this.client.request<DnsResponse>(
      'GET',
      `/${encodeURIComponent(domain)}/dns`,
      undefined,
      undefined,
      options
    );
  }

  async dnsAdd(domain: string, data: DnsAddInput, options?: RequestOptions): Promise<DnsResponse> {
    return this.client.request<DnsResponse>(
      'POST',
      `/${encodeURIComponent(domain)}/dns`,
      data,
      undefined,
      options
    );
  }

  async dnsRemove(
    domain: string,
    id: string | number,
    options?: RequestOptions
  ): Promise<DnsResponse> {
    return this.client.request<DnsResponse>(
      'DELETE',
      `/${encodeURIComponent(domain)}/dns/${encodeURIComponent(String(id))}`,
      undefined,
      undefined,
      options
    );
  }

  async zone(domain: string, options?: RequestOptions): Promise<ZoneResponse> {
    return this.client.request<ZoneResponse>(
      'GET',
      `/${encodeURIComponent(domain)}/zone`,
      undefined,
      undefined,
      options
    );
  }

  async zoneAdd(domain: string, data: ZoneAddInput, options?: RequestOptions): Promise<ZoneResponse> {
    return this.client.request<ZoneResponse>(
      'POST',
      `/${encodeURIComponent(domain)}/zone`,
      data,
      undefined,
      options
    );
  }

  async zoneRemove(
    domain: string,
    id: string | number,
    options?: RequestOptions
  ): Promise<ZoneResponse> {
    return this.client.request<ZoneResponse>(
      'DELETE',
      `/${encodeURIComponent(domain)}/zone/${encodeURIComponent(String(id))}`,
      undefined,
      undefined,
      options
    );
  }

  async settings(domain: string, data: Partial<Settings>, options?: RequestOptions): Promise<Settings> {
    return this.client.request<Settings>(
      'PUT',
      `/${encodeURIComponent(domain)}/settings`,
      data,
      undefined,
      options
    );
  }

  async analytics(domain: string, options?: RequestOptions): Promise<Analytics> {
    return this.client.request<Analytics>(
      'GET',
      `/${encodeURIComponent(domain)}/analytics`,
      undefined,
      undefined,
      options
    );
  }

  async usage(domain: string, options?: RequestOptions): Promise<Analytics> {
    return this.client.request<Analytics>(
      'GET',
      `/${encodeURIComponent(domain)}/usage`,
      undefined,
      undefined,
      options
    );
  }

  async audit(domain: string, options?: RequestOptions): Promise<AuditResponse> {
    return this.client.request<AuditResponse>(
      'GET',
      `/${encodeURIComponent(domain)}/audit`,
      undefined,
      undefined,
      options
    );
  }

  async deploy(
    domain: string,
    data: unknown,
    deployMeta: { version: string; fileCount: number; cmd: string; projectSize: number },
    options?: RequestOptions
  ): Promise<DeployResponse> {
    const headers = {
      version: deployMeta.version,
      'file-count': String(deployMeta.fileCount),
      cmd: deployMeta.cmd,
      'project-size': String(deployMeta.projectSize),
      timestamp: new Date().toISOString(),
    };
    return this.client.request<DeployResponse>(
      'PUT',
      `/${encodeURIComponent(domain)}`,
      data,
      headers,
      options
    );
  }

  async teardown(domain: string, options?: RequestOptions): Promise<Teardown> {
    return this.client.request<Teardown>(
      'DELETE',
      `/${encodeURIComponent(domain)}`,
      undefined,
      undefined,
      options
    );
  }

  async plans(domain?: string, options?: RequestOptions): Promise<Plans> {
    const path = domain ? `/${encodeURIComponent(domain)}/plans` : '/plans';
    return this.client.request<Plans>('GET', path, undefined, undefined, options);
  }

  async getDnsRecords(domain: string, options?: RequestOptions): Promise<DnsRecord[]> {
    const result = await this.dns(domain, options);
    return Array.isArray(result) ? result : Object.values(result).flat();
  }

  async getZoneRecords(domain: string, options?: RequestOptions): Promise<ZoneRecord[]> {
    const result = await this.zone(domain, options);
    return Array.isArray(result) ? result : Object.values(result).flat();
  }
}

export default Surge;
export { SurgeClient, SurgeApiError, BASE_URL } from './client';
export type * from './types';
