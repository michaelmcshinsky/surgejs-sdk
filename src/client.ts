import type { RequestOptions, SurgeOptions } from './types';

export const BASE_URL = 'https://surge.surge.sh';

export class SurgeApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'SurgeApiError';
    this.status = status;
    this.body = body;
  }
}

export class SurgeClient {
  private baseUrl: string;
  private options: SurgeOptions;

  constructor(options: SurgeOptions = {}, baseUrl: string = BASE_URL) {
    this.options = { ...options };
    this.baseUrl = baseUrl;
  }

  setCredentials(options: SurgeOptions): void {
    this.options = { ...options };
  }

  clearCredentials(): void {
    this.options = {};
  }

  getCredentials(): Readonly<SurgeOptions> {
    return { ...this.options };
  }

  private buildAuthHeader(): string | undefined {
    const { username, password } = this.options;
    if (!username || !password) return undefined;
    return `Basic ${btoa(`${username}:${password}`)}`;
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extra,
    };
    const auth = this.buildAuthHeader();
    if (auth) headers['Authorization'] = auth;
    return headers;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: this.buildHeaders(extraHeaders),
      signal: options?.signal,
    };

    if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
      init.body = JSON.stringify(body);
    } else if (body !== undefined && method === 'DELETE') {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      const message =
        typeof parsed === 'object' && parsed !== null && 'message' in parsed
          ? String((parsed as { message: unknown }).message)
          : `Surge API request failed with status ${response.status}`;
      throw new SurgeApiError(message, response.status, parsed);
    }

    return parsed as T;
  }
}
