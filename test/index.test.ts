import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Surge, SurgeApiError, BASE_URL } from '../src/index';

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  server.resetHandlers();
});

describe('Surge', () => {
  it('stores credentials via init and includes Basic auth header', async () => {
    let authHeader: string | null = null;
    server.use(
      http.get(`${BASE_URL}/account`, ({ request }) => {
        authHeader = request.headers.get('authorization');
        return HttpResponse.json({
          email: 'user@example.com',
          id: '1',
          role: 0,
          updated_at: '',
          created_at: '',
          email_verified_at: '',
          plan: { id: 's', name: 'Student', amount: '0', friendly: 'Free', dummy: true, current: true, metadata: { type: 'student' }, ext: '', perks: [] },
        });
      })
    );

    const surge = new Surge();
    surge.init({ username: 'user@example.com', password: 'secret' });
    await surge.account();

    expect(authHeader).toBe(`Basic ${btoa('user@example.com:secret')}`);
  });

  it('login sets credentials and returns token', async () => {
    server.use(
      http.post(`${BASE_URL}/token`, () => HttpResponse.json({ email: 'a@b.c', token: 'tok' }))
    );

    const surge = new Surge();
    const result = await surge.login('a@b.c', 'pw');

    expect(result.token).toBe('tok');
    expect(surge.getCredentials()).toEqual({ username: 'a@b.c', password: 'pw' });
  });

  it('logout clears credentials', async () => {
    const surge = new Surge({ username: 'a', password: 'b' });
    surge.logout();
    expect(surge.getCredentials()).toEqual({});
  });

  it('throws SurgeApiError with status and body on failure', async () => {
    server.use(
      http.get(`${BASE_URL}/account`, () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
      )
    );

    const surge = new Surge({ username: 'a', password: 'b' });
    await expect(surge.account()).rejects.toThrowError(SurgeApiError);
    try {
      await surge.account();
    } catch (error) {
      expect((error as SurgeApiError).status).toBe(401);
      expect((error as SurgeApiError).message).toBe('Unauthorized');
    }
  });

  it('list returns project entries', async () => {
    server.use(
      http.get(`${BASE_URL}/list`, () =>
        HttpResponse.json([{ domain: 'example.surge.sh', planName: 'Free' }])
      )
    );

    const surge = new Surge({ username: 'a', password: 'b' });
    const result = await surge.list();
    expect(result).toHaveLength(1);
    expect(result[0]?.domain).toBe('example.surge.sh');
  });

  it('dnsAdd posts record body', async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE_URL}/myapp.surge.sh/dns`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json([{ id: 1, type: 'A', name: '@', value: '1.2.3.4' }]);
      })
    );

    const surge = new Surge({ username: 'a', password: 'b' });
    const result = await surge.dnsAdd('myapp.surge.sh', { type: 'A', name: '@', value: '1.2.3.4' });

    expect(body).toEqual({ type: 'A', name: '@', value: '1.2.3.4' });
    expect(result).toHaveLength(1);
  });

  it('dnsRemove DELETEs by id', async () => {
    let method = '';
    server.use(
      http.delete(`${BASE_URL}/myapp.surge.sh/dns/42`, ({ request }) => {
        method = request.method;
        return HttpResponse.json([]);
      })
    );

    const surge = new Surge({ username: 'a', password: 'b' });
    await surge.dnsRemove('myapp.surge.sh', 42);
    expect(method).toBe('DELETE');
  });

  it('plans without domain hits /plans', async () => {
    server.use(
      http.get(`${BASE_URL}/plans`, () =>
        HttpResponse.json({ stripe_pk: 'pk', current: null, list: [], message: '' })
      )
    );

    const surge = new Surge({ username: 'a', password: 'b' });
    const result = await surge.plans();
    expect(result.stripe_pk).toBe('pk');
  });

  it('getDnsRecords flattens object responses', async () => {
    server.use(
      http.get(`${BASE_URL}/myapp.surge.sh/dns`, () =>
        HttpResponse.json({ A: [{ id: 1, type: 'A', name: '@', value: '1.2.3.4' }] })
      )
    );

    const surge = new Surge({ username: 'a', password: 'b' });
    const records = await surge.getDnsRecords('myapp.surge.sh');
    expect(records).toHaveLength(1);
    expect(records[0]?.type).toBe('A');
  });

  it('supports AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();
    server.use(
      http.get(`${BASE_URL}/account`, () => new HttpResponse(null, { status: 499 }))
    );

    const surge = new Surge({ username: 'a', password: 'b' });
    await expect(surge.account({ signal: controller.signal })).rejects.toThrow();
  });
});
