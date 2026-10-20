import { afterEach, describe, expect, it, vi } from 'vitest'
import { request, requestStream } from '../../src/core/request.js'
import { MockFetch, json } from '../helpers/mock-fetch.js'

const ENDPOINT = 'https://api.test/x'

const hangingFetch: typeof globalThis.fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    // real fetch rejects on abort; a bare hanging promise would ignore it
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('aborted', 'AbortError')),
    )
  })

const noBodyFetch: typeof globalThis.fetch = () =>
  Promise.resolve(new Response(null, { status: 200 }))

const abortableFetch: typeof globalThis.fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('aborted', 'AbortError')),
    )
  })

function lastInit(mock: MockFetch): RequestInit & { duplex?: 'half' } {
  return mock.last()!.init
}

describe('request body handling', () => {
  it('defaults a string body to application/json', async () => {
    const mock = new MockFetch().on('POST /x', () => json({ ok: true }))
    await request({
      url: ENDPOINT,
      method: 'POST',
      body: '{"a":1}',
      fetchImpl: mock.fetchImpl,
    })
    expect(mock.last()?.headers['content-type']).toBe('application/json')
  })

  it('keeps an explicit content-type on a string body', async () => {
    const mock = new MockFetch().on('PUT /x', () => json({ ok: true }))
    await request({
      url: ENDPOINT,
      method: 'PUT',
      body: 'raw-bytes',
      headers: { 'content-type': 'text/plain' },
      fetchImpl: mock.fetchImpl,
    })
    expect(mock.last()?.headers['content-type']).toBe('text/plain')
  })

  it('does not force content-type on a binary body', async () => {
    const mock = new MockFetch().on('PUT /x', () => json({ ok: true }))
    await request({
      url: ENDPOINT,
      method: 'PUT',
      body: new Uint8Array([1, 2, 3]),
      fetchImpl: mock.fetchImpl,
    })
    expect(mock.last()?.headers['content-type']).toBeUndefined()
  })

  it('sets duplex half for non-string bodies', async () => {
    const mock = new MockFetch().on('PUT /x', () => json({ ok: true }))
    await request({
      url: ENDPOINT,
      method: 'PUT',
      body: new Uint8Array([1]),
      fetchImpl: mock.fetchImpl,
    })
    expect(lastInit(mock).duplex).toBe('half')
  })

  it('strips a caller-supplied content-length', async () => {
    const mock = new MockFetch().on('POST /x', () => json({}))
    await request({
      url: ENDPOINT,
      method: 'POST',
      body: 'hello',
      headers: { 'content-length': '999' },
      fetchImpl: mock.fetchImpl,
    })
    expect(mock.last()?.headers['content-length']).toBeUndefined()
  })

  it('never follows redirects and keeps auth off them', async () => {
    const mock = new MockFetch().on('GET /x', () => json({}))
    await request({
      url: ENDPOINT,
      auth: { username: 'token', password: 't' },
      fetchImpl: mock.fetchImpl,
    })
    expect(lastInit(mock).redirect).toBe('manual')
  })

  it('sanitizes unsafe header values instead of throwing', async () => {
    const mock = new MockFetch().on('PUT /x', () => json({}))
    await request({
      url: ENDPOINT,
      method: 'PUT',
      headers: { message: 'ship 🚀 it — now' },
      fetchImpl: mock.fetchImpl,
    })
    expect(mock.last()?.headers['message']).toBe('ship  it  now')
  })
})

describe('request failures', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllGlobals()
  })

  it('rejects with a network error when fetch is unavailable', async () => {
    vi.stubGlobal('fetch', undefined)
    const err = await request({ url: ENDPOINT }).catch((e: unknown) => e)
    expect((err as Error).name).toBe('SurgeNetworkError')
    expect((err as Error).message).toContain('global fetch is unavailable')
  })

  it('rejects with a network error when requestStream has no fetch', async () => {
    vi.stubGlobal('fetch', undefined)
    const err = await requestStream({ url: ENDPOINT, stream: true }).catch(
      (e: unknown) => e,
    )
    expect((err as Error).name).toBe('SurgeNetworkError')
  })

  it('aborts a request after the timeout', async () => {
    const err = await request({
      url: ENDPOINT,
      timeout: 20,
      fetchImpl: hangingFetch,
    }).catch((e: unknown) => e)
    expect((err as Error).name).toBe('SurgeNetworkError')
  })

  it('honors a pre-aborted signal combined with a timeout', async () => {
    const controller = new AbortController()
    controller.abort(new Error('already gone'))
    const err = await request({
      url: ENDPOINT,
      signal: controller.signal,
      timeout: 5_000,
      fetchImpl: globalThis.fetch,
    }).catch((e: unknown) => e)
    expect((err as Error).name).toBe('SurgeNetworkError')
  })

  it('cleans up the timeout timer on success', async () => {
    const mock = new MockFetch().on('GET /x', () => json({}))
    const res = await request({
      url: ENDPOINT,
      timeout: 30_000,
      fetchImpl: mock.fetchImpl,
    })
    expect(res.status).toBe(200)
  })

  it('rejects a streaming response that has no body', async () => {
    const err = await requestStream({
      url: ENDPOINT,
      stream: true,
      fetchImpl: noBodyFetch,
    }).catch((e: unknown) => e)
    expect((err as Error).message).toContain('no body stream')
  })

  it('wraps a mid-request abort as a network error', async () => {
    const controller = new AbortController()
    const promise = request({
      url: ENDPOINT,
      signal: controller.signal,
      fetchImpl: abortableFetch,
    }).catch((e: unknown) => e)
    controller.abort()
    const err = await promise
    expect((err as Error).name).toBe('SurgeNetworkError')
  })
})

describe('requestStream basics', () => {
  it('returns status, headers, and a readable body', async () => {
    const mock = new MockFetch().on('PUT /x', () =>
      new Response('line1\nline2\n', {
        status: 200,
        headers: { 'x-test': 'yes' },
      }),
    )
    const res = await requestStream({
      url: ENDPOINT,
      method: 'PUT',
      stream: true,
      fetchImpl: mock.fetchImpl,
    })
    expect(res.status).toBe(200)
    expect(res.headers['x-test']).toBe('yes')
    expect(res.body).toBeTruthy()
    const text = await new Response(res.body).text()
    expect(text).toBe('line1\nline2\n')
  })
})
