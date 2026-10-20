import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { createClient } from '../../src/index.js'
import { MockFetch, json, ndjson } from '../helpers/mock-fetch.js'
import { TempProject } from '../helpers/temp-project.js'

function client(mock: MockFetch, extra: Record<string, unknown> = {}) {
  return createClient({
    endpoint: 'https://api.test',
    token: 'tok',
    fetch: mock.fetchImpl,
    ...extra,
  })
}

// a Response body can only be consumed once — build a fresh one per call
function ndjsonInfo(): Response {
  return ndjson([{ type: 'info', urls: [], instances: [], metadata: { rev: 1 } }])
}

const AUTH = `Basic ${Buffer.from('token:tok').toString('base64')}`

describe('client edges', () => {
  it('exposes the resolved endpoint', () => {
    expect(client(new MockFetch()).endpoint).toBe('https://api.test')
  })

  it('stats() delegates to the public endpoint', async () => {
    const mock = new MockFetch().on('GET /stats', () =>
      json({ calls: '1', formatted: {} }),
    )
    const result = await client(mock).stats()
    expect(result.calls).toBe('1')
    expect(mock.last()?.headers['authorization']).toBeUndefined()
  })

  it('honors SURGE_ENDPOINT when no endpoint option is set', () => {
    const previous = process.env['SURGE_ENDPOINT']
    process.env['SURGE_ENDPOINT'] = 'https://env-endpoint.example/'
    try {
      const c = createClient({ token: 't', fetch: new MockFetch().fetchImpl })
      expect(c.endpoint).toBe('https://env-endpoint.example')
    } finally {
      if (previous === undefined) delete process.env['SURGE_ENDPOINT']
      else process.env['SURGE_ENDPOINT'] = previous
    }
  })
})

describe('auth edges', () => {
  it('mintToken returns the full server response', async () => {
    const mock = new MockFetch().on('POST /token', (req) => {
      expect(req.headers['authorization']).toBe(AUTH)
      return json(
        { token: 'minted', id: 'tok-9', scope: 'example.com', message: 'ci' },
        201,
      )
    })
    const result = await client(mock).auth.mintToken({
      domain: 'example.com',
      message: 'ci',
    })
    expect(result).toMatchObject({ token: 'minted', id: 'tok-9', scope: 'example.com' })
  })

  it('login falls back to the submitted email when the body omits it', async () => {
    const mock = new MockFetch().on('POST /token', () => json({ token: 't' }, 201))
    const result = await client(mock).auth.login('me@example.com', 'pw')
    expect(result.email).toBe('me@example.com')
  })

  it('createMfaSession passes options through', async () => {
    const mock = new MockFetch().on('POST /mfa/session', (req) => {
      expect(req.headers['x-trace']).toBe('1')
      return json({ url: 'https://x' }, 201)
    })
    await client(mock).auth.createMfaSession({ headers: { 'x-trace': '1' } })
  })

  it('pollLoginSession percent-encodes the uuid', async () => {
    const mock = new MockFetch().on(
      'POST /login/session/a%2Fb/poll',
      () => json({ status: 'gone' }),
    )
    const result = await client(mock).auth.pollLoginSession('a/b', 2)
    expect(result.status).toBe('gone')
  })
})

describe('billing edges', () => {
  it('subscription resolves per-domain', async () => {
    const mock = new MockFetch().on('GET /a.surge.sh/subscription', () =>
      json({ plan: { name: 'Standard' } }),
    )
    const result = await client(mock).billing.subscription('a.surge.sh')
    expect(result.plan?.name).toBe('Standard')
  })

  it('setPlan per-domain sends the plan body', async () => {
    const mock = new MockFetch().on('PUT /a.surge.sh/plan', (req) => {
      expect(JSON.parse(req.body?.toString() ?? '{}')).toEqual({ plan: 'pro' })
      return json({ msg: 'subscribed' })
    })
    await client(mock).billing.setPlan('a.surge.sh', { plan: 'pro' })
  })

  it('upgradeLink with a plan sends it in the body', async () => {
    const mock = new MockFetch().on('POST /upgrade/link', (req) => {
      expect(JSON.parse(req.body?.toString() ?? '{}')).toEqual({ plan: 'pro' })
      return json({ url: 'https://checkout' }, 201)
    })
    const result = await client(mock).billing.upgradeLink('pro')
    expect(result.url).toContain('checkout')
  })

  it('plans(domain) resolves per-domain', async () => {
    const mock = new MockFetch().on('GET /a.surge.sh/plans', () =>
      json({ list: [{ name: 'Pro' }] }),
    )
    const result = await client(mock).billing.plans('a.surge.sh')
    expect(result.list?.[0]?.name).toBe('Pro')
  })
})

describe('revision edges', () => {
  it('discard with a null revision targets /rev', async () => {
    const mock = new MockFetch().on('DELETE /a.surge.sh/rev', () => json({}))
    await client(mock).projects.discard('a.surge.sh', null as never)
    expect(mock.last()?.url).toContain('/a.surge.sh/rev')
    expect(mock.last()?.url).not.toContain('/rev/')
  })

  it('cutover with a null revision targets /rev', async () => {
    const mock = new MockFetch().on('PUT /a.surge.sh/rev', () => json({}))
    await client(mock).projects.cutover('a.surge.sh', null as never)
    expect(mock.last()?.url).not.toContain('/rev/')
  })
})

describe('collaborator edges', () => {
  it('revoke accepts a bare string email', async () => {
    const mock = new MockFetch().on('DELETE /a.surge.sh/collaborators', (req) => {
      expect(JSON.parse(req.body?.toString() ?? '{}')).toEqual({
        emails: ['x@y.z'],
      })
      return json({ successes: [], fails: [] }, 202)
    })
    await client(mock).collaborators.revoke('a.surge.sh', 'x@y.z')
  })

  it('invite accepts an array', async () => {
    const mock = new MockFetch().on('POST /a.surge.sh/collaborators', (req) => {
      expect(JSON.parse(req.body?.toString() ?? '{}')).toEqual({
        emails: ['a@b.c', 'd@e.f'],
      })
      return json({ invites: [] }, 202)
    })
    await client(mock).collaborators.invite('a.surge.sh', ['a@b.c', 'd@e.f'])
  })
})

describe('stream credential resolution', () => {
  it('encrypt honors per-call creds over the client token', async () => {
    const override = `Basic ${Buffer.from('token:other').toString('base64')}`
    const mock = new MockFetch().on('PUT /example.com/encrypt', (req) => {
      expect(req.headers['authorization']).toBe(override)
      return ndjsonInfo()
    })
    await client(mock).encrypt('example.com', { creds: 'other' }).completed
  })

  it('encrypt works with no credentials configured (auth header absent)', async () => {
    const mock = new MockFetch().on('PUT /example.com/encrypt', (req) => {
      expect(req.headers['authorization']).toBeUndefined()
      return ndjsonInfo()
    })
    const bare = createClient({
      endpoint: 'https://api.test',
      fetch: mock.fetchImpl,
    })
    await bare.encrypt('example.com').completed
  })

  it('ssl honors per-call creds', async () => {
    const project = new TempProject().file('c.pem', 'PEM')
    const override = `Basic ${Buffer.from('token:other').toString('base64')}`
    const mock = new MockFetch().on('PUT /example.com/ssl', (req) => {
      expect(req.headers['authorization']).toBe(override)
      return ndjsonInfo()
    })
    try {
      await client(mock)
        .ssl(join(project.path, 'c.pem'), 'example.com', { creds: 'other' })
        .completed
    } finally {
      project.cleanup()
    }
  })

  it('publish honors per-call creds', async () => {
    const project = new TempProject().file('index.html', 'x')
    const override = `Basic ${Buffer.from('token:other').toString('base64')}`
    const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
      expect(req.headers['authorization']).toBe(override)
      return ndjsonInfo()
    })
    try {
      await client(mock).publish(project.path, 'x.surge.sh', {
        creds: 'other',
      }).completed
    } finally {
      project.cleanup()
    }
  })

  it('publish passes a version override as the version header', async () => {
    const project = new TempProject().file('index.html', 'x')
    const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
      expect(req.headers['version']).toBe('9.9.9')
      return ndjsonInfo()
    })
    try {
      await client(mock).publish(project.path, 'x.surge.sh', {
        version: '9.9.9',
      }).completed
    } finally {
      project.cleanup()
    }
  })

  it('ssl works with no credentials configured', async () => {
    const project = new TempProject().file('c.pem', 'PEM')
    const mock = new MockFetch().on('PUT /example.com/ssl', (req) => {
      expect(req.headers['authorization']).toBeUndefined()
      return ndjsonInfo()
    })
    try {
      const bare = createClient({
        endpoint: 'https://api.test',
        fetch: mock.fetchImpl,
      })
      await bare.ssl(join(project.path, 'c.pem'), 'example.com').completed
    } finally {
      project.cleanup()
    }
  })
})

describe('cname edge cases', () => {
  it('ignores a non-string surge.domain in package.json', async () => {
    const { readCname } = await import('../../src/cname.js')
    const dir = new TempProject().file(
      'package.json',
      JSON.stringify({ surge: { domain: 123 } }),
    )
    try {
      expect(readCname(dir.path)).toBeNull()
    } finally {
      dir.cleanup()
    }
  })

  it('survives malformed package.json', async () => {
    const { readCname } = await import('../../src/cname.js')
    const dir = new TempProject().file('package.json', '{not json')
    try {
      expect(readCname(dir.path)).toBeNull()
    } finally {
      dir.cleanup()
    }
  })

  it('survives an unreadable CNAME (directory in the way)', async () => {
    const { readCname } = await import('../../src/cname.js')
    const dir = new TempProject()
    try {
      // a directory named CNAME makes readFile throw EISDIR
      const { mkdirSync } = await import('node:fs')
      mkdirSync(join(dir.path, 'CNAME'))
      expect(readCname(dir.path)).toBeNull()
    } finally {
      dir.cleanup()
    }
  })

  it('writeCname validates before touching the filesystem', async () => {
    const { writeCname } = await import('../../src/cname.js')
    const dir = new TempProject()
    try {
      expect(() => writeCname(dir.path, 'not a domain')).toThrow(TypeError)
    } finally {
      dir.cleanup()
    }
  })
})
