import { afterEach, describe, expect, it } from 'vitest'
import { basicAuthHeader, request } from '../../src/core/request.js'
import { RequestContext } from '../../src/core/context.js'
import { errorFromResponse } from '../../src/core/errors.js'
import { createClient } from '../../src/index.js'
import { StreamHandle } from '../../src/stream/handle.js'
import { handshake } from '../../src/stream/handshake.js'
import { tarEnd, tarHeader } from '../../src/stream/tar.js'
import { MockFetch, json } from '../helpers/mock-fetch.js'
import { readTar } from '../helpers/tar-reader.js'

const ENDPOINT = 'https://api.test/x'

const hangingFetch: typeof globalThis.fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('aborted', 'AbortError')),
    )
  })

const weirdFetch: typeof globalThis.fetch = () =>
  Promise.reject('string rejection' as unknown)

describe('withCredentials object forms', () => {
  it('accepts { user, pass } token shape', async () => {
    const expected = `Basic ${Buffer.from('token:abc').toString('base64')}`
    const mock = new MockFetch().on('GET /account', (req) => {
      expect(req.headers['authorization']).toBe(expected)
      return json({ email: 'x' })
    })
    const client = createClient({
      endpoint: 'https://api.test',
      fetch: mock.fetchImpl,
    })
    await client.withCredentials({ user: 'token', pass: 'abc' }).account.get()
  })

  it('accepts { username, password } shape', async () => {
    const expected = `Basic ${Buffer.from('me@x.com:pw').toString('base64')}`
    const mock = new MockFetch().on('GET /account', (req) => {
      expect(req.headers['authorization']).toBe(expected)
      return json({ email: 'me@x.com' })
    })
    const client = createClient({
      endpoint: 'https://api.test',
      fetch: mock.fetchImpl,
    })
    const acct = await client
      .withCredentials({ username: 'me@x.com', password: 'pw' })
      .account.get()
    expect(acct.email).toBe('me@x.com')
  })
})

describe('endpoint resolution', () => {
  const previous = process.env['SURGE_ENDPOINT']

  afterEach(() => {
    if (previous === undefined) delete process.env['SURGE_ENDPOINT']
    else process.env['SURGE_ENDPOINT'] = previous
  })

  it('uses the public default when neither option nor env is set', () => {
    delete process.env['SURGE_ENDPOINT']
    const client = createClient({ token: 't', fetch: new MockFetch().fetchImpl })
    expect(client.endpoint).toBe('https://surge.surge.sh')
  })

  it('prefers the option over the env', () => {
    process.env['SURGE_ENDPOINT'] = 'https://env.example'
    const client = createClient({
      endpoint: 'https://opt.example/',
      token: 't',
      fetch: new MockFetch().fetchImpl,
    })
    expect(client.endpoint).toBe('https://opt.example')
  })

  it('strips trailing slashes from the env endpoint', () => {
    process.env['SURGE_ENDPOINT'] = 'https://env.example///'
    const client = createClient({ token: 't', fetch: new MockFetch().fetchImpl })
    expect(client.endpoint).toBe('https://env.example')
  })
})

describe('RequestContext.call path handling', () => {
  it('accepts a path without a leading slash', async () => {
    const mock = new MockFetch().on('GET /account', () => json({ email: 'x' }))
    const ctx = new RequestContext({
      endpoint: 'https://api.test',
      token: 't',
      fetch: mock.fetchImpl,
    })
    const result = await ctx.call<{ email: string }>('GET', 'account')
    expect(result.email).toBe('x')
  })

  it('merges per-call headers over the defaults', async () => {
    const mock = new MockFetch().on('GET /account', () => json({}))
    const ctx = new RequestContext({
      endpoint: 'https://api.test',
      token: 't',
      fetch: mock.fetchImpl,
    })
    await ctx.call('GET', '/account', {
      headers: { 'x-custom': 'yes', accept: 'application/problem+json' },
    })
    expect(mock.last()?.headers['x-custom']).toBe('yes')
    expect(mock.last()?.headers['accept']).toBe('application/problem+json')
  })
})

describe('error message shapes', () => {
  it('accepts a bare string in the messages field', () => {
    const err = errorFromResponse(400, { messages: 'one bad thing' })
    expect(err.messages).toEqual(['one bad thing'])
  })
})

describe('basicAuthHeader partials', () => {
  it('encodes a missing username as empty', () => {
    expect(basicAuthHeader({ password: 'x' } as { password: string } as never)).toBe(
      `Basic ${Buffer.from(':x').toString('base64')}`,
    )
  })

  it('encodes a missing password as empty', () => {
    expect(basicAuthHeader({ username: 'u' } as { username: string } as never)).toBe(
      `Basic ${Buffer.from('u:').toString('base64')}`,
    )
  })
})

describe('withTimeout live-signal paths', () => {
  it('registers an abort listener when a live signal is combined with a timeout', async () => {
    const controller = new AbortController()
    const err = await request({
      url: ENDPOINT,
      signal: controller.signal,
      timeout: 20,
      fetchImpl: hangingFetch,
    }).catch((e: unknown) => e)
    expect((err as Error).name).toBe('SurgeNetworkError')
  })

  it('forwards a mid-flight signal abort through the listener', async () => {
    const controller = new AbortController()
    const promise = request({
      url: ENDPOINT,
      signal: controller.signal,
      timeout: 30_000,
      fetchImpl: hangingFetch,
    }).catch((e: unknown) => e)
    controller.abort(new Error('caller aborted'))
    const err = await promise
    expect((err as Error).name).toBe('SurgeNetworkError')
  })
})

describe('handshake status fallbacks and error bodies', () => {
  it('falls back to Forbidden when 403 carries no reason', async () => {
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      new Response('', { status: 403 }),
    )
    const handle = handshake({
      endpoint: 'https://api.test',
      path: 'x.surge.sh',
      version: '1.0.0',
      userAgent: 't',
      fetchImpl: mock.fetchImpl,
    })
    const seen: string[] = []
    handle.on('forbidden', (r) => seen.push(r))
    await expect(handle.completed).rejects.toThrow()
    expect(seen).toEqual(['Forbidden'])
  })

  it('falls back to Invalid when 422 carries no reason', async () => {
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      new Response('', { status: 422 }),
    )
    const handle = handshake({
      endpoint: 'https://api.test',
      path: 'x.surge.sh',
      version: '1.0.0',
      userAgent: 't',
      fetchImpl: mock.fetchImpl,
    })
    const seen: string[] = []
    handle.on('invalid', (r) => seen.push(r))
    await expect(handle.completed).rejects.toThrow()
    expect(seen).toEqual(['Invalid'])
  })

  it('truncates an error body larger than 64 KB and still fails typed', async () => {
    const huge = 'x'.repeat(70 * 1024)
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      new Response(huge, { status: 500 }),
    )
    const handle = handshake({
      endpoint: 'https://api.test',
      path: 'x.surge.sh',
      version: '1.0.0',
      userAgent: 't',
      fetchImpl: mock.fetchImpl,
    })
    const err = await handle.completed.catch((e: unknown) => e)
    expect((err as Error).name).toBe('SurgeHttpError')
    expect((err as { messages: string[] }).messages[0]!.length).toBeLessThanOrEqual(
      70 * 1024,
    )
  })

  it('tolerates a non-Error rejection from fetch', async () => {
    const handle = handshake({
      endpoint: 'https://api.test',
      path: 'x.surge.sh',
      version: '1.0.0',
      userAgent: 't',
      fetchImpl: weirdFetch,
    })
    const err = await handle.completed.catch((e: unknown) => e)
    expect((err as Error).message).toBe('string rejection')
  })

  it('still fails typed when the error body stream dies mid-read', async () => {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    const dying = new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          controller = c
          c.enqueue(new TextEncoder().encode('partial'))
        },
        pull() {
          controller?.error(new Error('body reset'))
        },
      }),
      { status: 500 },
    )
    const mock = new MockFetch().otherwise(() => dying)
    const handle = handshake({
      endpoint: 'https://api.test',
      path: 'x.surge.sh',
      version: '1.0.0',
      userAgent: 't',
      fetchImpl: mock.fetchImpl,
    })
    const err = await handle.completed.catch((e: unknown) => e)
    expect((err as Error).name).toBe('SurgeHttpError')
  })
})

describe('handle parked-on-fail', () => {
  it('ends a parked iterator when fail arrives with no frames', async () => {
    const handle = new StreamHandle()
    const collected: unknown[] = []
    const iterate = (async () => {
      for await (const frame of handle) collected.push(frame)
    })()
    await new Promise((r) => setTimeout(r, 5))
    handle.emit('fail', new Error('nope'))
    await iterate
    expect(collected).toEqual([])
    await expect(handle.completed).rejects.toThrow('nope')
  })
})

describe('tar splitPrefix loop paths', () => {
  it('uses tarJoin and the root break for a long relative path', () => {
    const name = `${'x'.repeat(160)}/${'y'.repeat(120)}`
    const header = tarHeader(name, 0, 0o644)
    expect(header.length).toBeGreaterThan(512)
    const archive = Buffer.concat([
      Buffer.from(header),
      Buffer.from(tarEnd()),
    ])
    const entries = readTar(archive)
    expect(entries[0]?.name).toBe(name)
  })

  it('hits dirname slash-root for an absolute long path', () => {
    const name = `/${'a'.repeat(156)}/${'b'.repeat(120)}`
    const header = tarHeader(name, 0, 0o644)
    const archive = Buffer.concat([
      Buffer.from(header),
      Buffer.from(tarEnd()),
    ])
    const entries = readTar(archive)
    expect(entries[0]?.name).toBe(name)
  })

  it('needs PAX when 99 multi-byte characters overflow the name field', () => {
    const name = `site/${'é'.repeat(99)}`
    const header = tarHeader(name, 0, 0o644)
    expect(header.length).toBeGreaterThan(512)
    const archive = Buffer.concat([
      Buffer.from(header),
      Buffer.from(tarEnd()),
    ])
    const entries = readTar(archive)
    expect(entries[0]?.name).toBe(name)
  })
})
