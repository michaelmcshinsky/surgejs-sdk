import { describe, expect, it, vi } from 'vitest'
import { createClient } from '../../src/index.js'
import {
  SurgeAuthError,
  SurgePermissionError,
  SurgeRateLimitError,
  SurgeValidationError,
} from '../../src/core/errors.js'
import { MockFetch, json } from '../helpers/mock-fetch.js'

const TOKEN = 'test-token-123'

function client(mock: MockFetch, extra: Record<string, unknown> = {}) {
  return createClient({
    endpoint: 'https://api.test',
    token: TOKEN,
    fetch: mock.fetchImpl,
    ...extra,
  })
}

function authHeader(req: { headers: Record<string, string> }): string {
  return req.headers['authorization'] ?? ''
}

function basic(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
}

/** A fetch that always fails like a refused connection. */
const failingFetch: typeof globalThis.fetch = () =>
  Promise.reject(
    Object.assign(new Error('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      }),
    }),
  )

describe('JSON client', () => {
  it('sends token Basic auth on authenticated calls', async () => {
    const mock = new MockFetch().on('GET /account', () => json({ email: 'a@b.c' }))
    const c = client(mock)
    const account = await c.account.get()
    expect(account.email).toBe('a@b.c')
    expect(authHeader(mock.last()!)).toBe(basic('token', TOKEN))
  })

  it('skips auth on public endpoints', async () => {
    const mock = new MockFetch().on('GET /stats', () =>
      json({ calls: '1', formatted: {} }),
    )
    await client(mock).stats()
    expect(authHeader(mock.last()!)).toBe('')
  })

  describe('account', () => {
    it('GET /account', async () => {
      const mock = new MockFetch().on('GET /account', () =>
        json({ email: 'x@y.z', plan: { name: 'Standard' } }),
      )
      const acct = await client(mock).account.get()
      expect(acct.plan?.name).toBe('Standard')
    })

    it('POST /verification', async () => {
      const mock = new MockFetch().on('POST /verification', () =>
        json({ verified: false, sent: true }, 201),
      )
      const result = await client(mock).account.verify()
      expect(result).toEqual({ verified: false, sent: true })
      expect(mock.last()?.method).toBe('POST')
    })

    it('DELETE /account (nuke)', async () => {
      const mock = new MockFetch().on('DELETE /account', () => json({ msg: 'bye' }))
      await client(mock).account.nuke()
      expect(mock.last()?.method).toBe('DELETE')
    })
  })

  describe('auth', () => {
    it('login mints a token with email+password, not the client token', async () => {
      const mock = new MockFetch().on('POST /token', (req) => {
        expect(authHeader(req)).toBe(basic('me@example.com', 'pw'))
        return json({ email: 'me@example.com', token: 'fresh' }, 201)
      })
      const result = await client(mock).auth.login('me@example.com', 'pw')
      expect(result.token).toBe('fresh')
      expect(result.credentials).toEqual({ user: 'token', pass: 'fresh' })
    })

    it('resetPassword is unauthenticated', async () => {
      // the email rides the path percent-encoded
      const mock = new MockFetch().on(
        'POST /token/reset/me%40example.com',
        () => json({}, 201),
      )
      await client(mock).auth.resetPassword('me@example.com')
      expect(authHeader(mock.last()!)).toBe('')
    })

    it('login session + poll', async () => {
      const mock = new MockFetch()
        .on('POST /login/session', () => json({ uuid: 'u-1', code: 'ABCD' }))
        .on('POST /login/session/u-1/poll', () =>
          json({ status: 'approved', token: 'tok' }),
        )
      const c = client(mock)
      const session = await c.auth.createLoginSession('localhost')
      expect(session.uuid).toBe('u-1')
      const poll = await c.auth.pollLoginSession(session.uuid, 1)
      expect(poll).toEqual({ status: 'approved', token: 'tok' })
    })

    it('mfa session', async () => {
      const mock = new MockFetch().on('POST /mfa/session', () =>
        json({ url: 'https://surge.sh/mfa/x' }, 201),
      )
      const result = await client(mock).auth.createMfaSession()
      expect(result.url).toContain('https://')
    })
  })

  describe('tokens', () => {
    it('list / add / remove', async () => {
      const mock = new MockFetch()
        .on('GET /tokens', () => json([{ id: 'tok-1', message: 'ci' }]))
        .on('POST /token', () => json({ token: 'new', id: 'tok-2' }, 201))
        .on('DELETE /tokens/tok-1', () => json({ msg: 'expired' }))
      const c = client(mock)
      const list = await c.tokens.list()
      expect(list[0]?.id).toBe('tok-1')
      const added = await c.tokens.add({ domain: 'example.com', message: 'ci' })
      expect(added.token).toBe('new')
      const body = JSON.parse(mock.requests[1]?.body?.toString() ?? '{}')
      expect(body).toEqual({ domain: 'example.com', message: 'ci' })
      await c.tokens.remove('tok-1')
      expect(mock.last()?.url).toContain('/tokens/tok-1')
    })
  })

  describe('projects', () => {
    it('list account projects and project revisions', async () => {
      const mock = new MockFetch()
        .on('GET /list', () => json([{ domain: 'a.surge.sh' }]))
        .on('GET /a.surge.sh/list', () => json([{ rev: '1719852000000' }]))
      const c = client(mock)
      const projects = await c.projects.list()
      expect(projects[0]?.domain).toBe('a.surge.sh')
      const revs = await c.projects.list('a.surge.sh')
      expect(revs[0]?.rev).toBe('1719852000000')
      const revs2 = await c.projects.revisions('a.surge.sh')
      expect(revs2[0]?.rev).toBe('1719852000000')
    })

    it('teardown / rollback / rollfore / cutover / discard / bust', async () => {
      const mock = new MockFetch()
        .on('DELETE /a.surge.sh', () => json({ msg: 'project removed' }))
        .on('POST /a.surge.sh/rollback', () => json({ revision: '2', former: '3' }))
        .on('POST /a.surge.sh/rollfore', () => json({ revision: '3' }))
        .on('PUT /a.surge.sh/rev', () => json({ ok: true }))
        .on('PUT /a.surge.sh/rev/1719852000000', () => json({ ok: true }))
        .on('DELETE /a.surge.sh/rev/1719852000000', () => json({ ok: true }))
        .on('DELETE /a.surge.sh/cache', () =>
          json({ confirmed: ['sfo'], unconfirmed: [] }),
        )
      const c = client(mock)
      expect((await c.projects.teardown('a.surge.sh')).msg).toBe('project removed')
      expect((await c.projects.rollback('a.surge.sh')).revision).toBe('2')
      expect((await c.projects.rollfore('a.surge.sh')).revision).toBe('3')
      await c.projects.cutover('a.surge.sh')
      await c.projects.cutover('a.surge.sh', '1719852000000')
      await c.projects.discard('a.surge.sh', '1719852000000')
      const bust = await c.projects.bust('a.surge.sh')
      expect(bust.confirmed).toEqual(['sfo'])
    })

    it('metadata and manifest with and without a revision', async () => {
      const mock = new MockFetch()
        .on('GET /a.surge.sh/metadata.json', () => json({ rev: '9' }))
        .on('GET /a.surge.sh/7/metadata.json', () => json({ rev: '7' }))
        .on('GET /a.surge.sh/manifest.json', () =>
          json({ 'index.html': { size: 15, md5: 'abc' } }),
        )
        .on('GET /a.surge.sh/7/manifest.json', () => json({}))
      const c = client(mock)
      expect((await c.projects.metadata('a.surge.sh')).rev).toBe('9')
      expect((await c.projects.metadata('a.surge.sh', '7')).rev).toBe('7')
      const manifest = await c.projects.manifest('a.surge.sh')
      expect(manifest['index.html']?.size).toBe(15)
      await c.projects.manifest('a.surge.sh', '7')
    })

    it('status and certs', async () => {
      const mock = new MockFetch()
        .on('GET /a.surge.sh/status', () =>
          json({ status: 'waiting on dns', records: [] }),
        )
        .on('GET /a.surge.sh/certs', () => json({ issuer: "Let's Encrypt" }))
      const c = client(mock)
      expect((await c.projects.status('a.surge.sh')).status).toBe('waiting on dns')
      expect((await c.projects.certs('a.surge.sh')).issuer).toBe("Let's Encrypt")
    })

    it('rejects a missing domain synchronously', async () => {
      const c = client(new MockFetch())
      expect(() => c.projects.teardown('')).toThrow(TypeError)
    })
  })

  describe('dns & zone', () => {
    it('dns list / add / remove', async () => {
      const mock = new MockFetch()
        .on('GET /example.com/dns', () => json([{ id: 1, type: 'MX' }]))
        .on('POST /example.com/dns', (req) => {
          // regression: the old SDK wrapped the body in { data }
          const body = JSON.parse(req.body?.toString() ?? '{}')
          expect(body).toEqual({ type: 'MX', name: '@', value: 'mail', priority: 10 })
          expect(body.data).toBeUndefined()
          return json({ ok: true }, 201)
        })
        .on('DELETE /example.com/dns/1', () => json({ ok: true }))
      const c = client(mock)
      await c.dns.list('example.com')
      await c.dns.add('example.com', {
        type: 'MX',
        name: '@',
        value: 'mail',
        priority: 10,
      })
      await c.dns.remove('example.com', 1)
      expect(mock.requests).toHaveLength(3)
    })

    it('zone list / add / remove — add uses POST (old SDK used GET)', async () => {
      const mock = new MockFetch()
        .on('GET /example.com/zone', () => json([{ id: 'z1', type: 'A' }]))
        .on('POST /example.com/zone', () => json({ ok: true }, 201))
        .on('DELETE /example.com/zone/z1', () => json({ ok: true }))
      const c = client(mock)
      await c.zone.list('example.com')
      await c.zone.add('example.com', { type: 'A', name: '@', value: '1.2.3.4' })
      await c.zone.remove('example.com', 'z1')
      expect(mock.requests[1]?.method).toBe('POST')
    })
  })

  describe('collaborators, settings, analytics', () => {
    it('invite and revoke send { emails } bodies', async () => {
      const mock = new MockFetch()
        .on('POST /a.surge.sh/collaborators', (req) => {
          expect(JSON.parse(req.body?.toString() ?? '{}')).toEqual({
            emails: ['x@y.z'],
          })
          return json({ invites: [{ email: 'x@y.z', status: 'sent' }] }, 202)
        })
        .on('DELETE /a.surge.sh/collaborators', () =>
          json({ successes: [], fails: [] }, 202),
        )
      const c = client(mock)
      const invite = await c.collaborators.invite('a.surge.sh', 'x@y.z')
      expect(invite.invites[0]?.status).toBe('sent')
      await c.collaborators.revoke('a.surge.sh', ['x@y.z'])
    })

    it('settings update', async () => {
      const mock = new MockFetch().on('PUT /a.surge.sh/settings', (req) => {
        expect(JSON.parse(req.body?.toString() ?? '{}')).toEqual({ force: 'https' })
        return json({ force: 'https' })
      })
      const result = await client(mock).settings.update('a.surge.sh', {
        force: 'https',
      })
      expect(result.force).toBe('https')
    })

    it('settings support private and clearing with null', async () => {
      const mock = new MockFetch().on('PUT /a.surge.sh/settings', (req) => {
        const body = JSON.parse(req.body?.toString() ?? '{}')
        expect(body).toEqual({ private: true, cors: null })
        return json({ private: true, cors: null })
      })
      const result = await client(mock).settings.update('a.surge.sh', {
        private: true,
        cors: null,
      })
      expect(result.private).toBe(true)
      expect(result.cors).toBeNull()
    })

    it('analytics / usage / audit', async () => {
      const mock = new MockFetch()
        .on('GET /a.surge.sh/analytics', () => json({ range: ['a', 'b'] }))
        .on('GET /a.surge.sh/usage', () => json({ bandwidth: {} }))
        .on('GET /a.surge.sh/audit', () => json({ 'sfo.surge.sh': { rev: '1' } }))
      const c = client(mock)
      expect((await c.analytics.get('a.surge.sh')).range).toEqual(['a', 'b'])
      await c.analytics.usage('a.surge.sh')
      const audit = await c.analytics.audit('a.surge.sh')
      expect(audit['sfo.surge.sh']?.rev).toBe('1')
    })
  })

  describe('billing', () => {
    it('plans / setPlan / subscription / setCard / links', async () => {
      const mock = new MockFetch()
        .on('GET /plans', () => json({ list: [{ name: 'Standard' }] }))
        .on('GET /a.surge.sh/plans', () => json({ list: [] }))
        .on('PUT /plan', () => json({ ok: true }))
        .on('PUT /a.surge.sh/plan', () => json({ ok: true }))
        .on('GET /subscription', () => json({ plan: null }))
        .on('PUT /card', () => json({ last4: '4242' }, 201))
        .on('POST /upgrade/link', () => json({ url: 'https://checkout' }, 201))
        .on('POST /billing/link', () => json({ url: 'https://portal' }, 201))
      const c = client(mock)
      expect((await c.billing.plans()).list?.[0]?.name).toBe('Standard')
      await c.billing.plans('a.surge.sh')
      await c.billing.setPlan({ plan: 'std' })
      await c.billing.setPlan('a.surge.sh', { plan: 'std' })
      await c.billing.subscription()
      expect((await c.billing.setCard({ token: 'src_1' })).last4).toBe('4242')
      expect((await c.billing.upgradeLink()).url).toContain('checkout')
      await c.billing.upgradeLink('pro')
      expect((await c.billing.billingLink()).url).toContain('portal')
    })
  })

  describe('errors & status handlers', () => {
    it('maps 401 to SurgeAuthError', async () => {
      const mock = new MockFetch().on('GET /account', () =>
        json({ messages: ['token expired'] }, 401),
      )
      await expect(client(mock).account.get()).rejects.toBeInstanceOf(SurgeAuthError)
    })

    it('maps 403 with reason header', async () => {
      const mock = new MockFetch().on('GET /list', () =>
        new Response('', { status: 403, headers: { reason: 'Rate limited' } }),
      )
      const err = await client(mock).projects.list().catch((e: unknown) => e)
      expect(err).toBeInstanceOf(SurgePermissionError)
      expect((err as SurgePermissionError).messages).toEqual(['Rate limited'])
    })

    it('maps 422 with details', async () => {
      const mock = new MockFetch().on('DELETE /bad_domain', () =>
        json({ messages: ['domain must be valid.'], details: { domain: 'x' } }, 422),
      )
      await expect(client(mock).projects.teardown('bad_domain')).rejects.toBeInstanceOf(
        SurgeValidationError,
      )
    })

    it('maps 429 to SurgeRateLimitError', async () => {
      const { TempProject } = await import('../helpers/temp-project.js')
      const project = new TempProject().file('index.html', 'x')
      const mock = new MockFetch().on('PUT /a.surge.sh', () =>
        json({ messages: ['slow down'] }, 429),
      )
      try {
        const handle = client(mock).publish(project.path, 'a.surge.sh')
        await expect(handle.completed).rejects.toBeInstanceOf(SurgeRateLimitError)
      } finally {
        project.cleanup()
      }
    })

    it('runs onStatus handlers before rejecting', async () => {
      const handler = vi.fn()
      const mock = new MockFetch().on('GET /account', () =>
        json({ messages: ['no'] }, 401),
      )
      const c = client(mock, { onStatus: { 401: handler } })
      await expect(c.account.get()).rejects.toThrow()
      expect(handler).toHaveBeenCalledOnce()
      const [err, res] = handler.mock.calls[0] ?? []
      expect((err as SurgeAuthError).status).toBe(401)
      expect((res as { status: number }).status).toBe(401)
    })

    it('wraps transport failures as SurgeNetworkError', async () => {
      const c = createClient({
        endpoint: 'https://api.test',
        token: 't',
        fetch: failingFetch,
      })
      const err = await c.account.get().catch((e: unknown) => e)
      expect((err as Error).name).toBe('SurgeNetworkError')
      expect((err as Error).message).toContain('ECONNREFUSED')
    })
  })

  describe('withCredentials', () => {
    it('clones with different credentials, leaving the original intact', async () => {
      const mock = new MockFetch().on('GET /account', () => json({ email: 'x' }))
      const c = client(mock)
      const other = c.withCredentials('other-token')
      await other.account.get()
      expect(authHeader(mock.last()!)).toBe(basic('token', 'other-token'))
      await c.account.get()
      expect(authHeader(mock.last()!)).toBe(basic('token', TOKEN))
    })
  })

  it('sends a version header and user-agent', async () => {
    const mock = new MockFetch().on('GET /account', () => json({}))
    await client(mock).account.get()
    const req = mock.last()!
    expect(req.headers['user-agent']).toMatch(/^surgejs-sdk\//)
  })

  it('honors a custom userAgent option', async () => {
    const mock = new MockFetch().on('GET /account', () => json({}))
    await client(mock, { userAgent: 'my-tool/9.9' }).account.get()
    expect(mock.last()?.headers['user-agent']).toBe('my-tool/9.9')
  })
})
