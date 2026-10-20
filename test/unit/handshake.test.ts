import { describe, expect, it } from 'vitest'
import { parseFrame, readLines } from '../../src/stream/handshake.js'
import { handshake } from '../../src/stream/handshake.js'
import type { StreamHandle } from '../../src/stream/handle.js'
import { MockFetch, json, ndjson } from '../helpers/mock-fetch.js'

const failingFetch: typeof globalThis.fetch = () =>
  Promise.reject(
    Object.assign(new Error('fetch failed'), {
      cause: Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    }),
  )

function base(
  overrides: Record<string, unknown> = {},
): Parameters<typeof handshake>[0] {
  return {
    endpoint: 'https://api.test',
    path: 'x.surge.sh',
    version: '1.0.0',
    userAgent: 'surgejs-sdk/test',
    fetchImpl: new MockFetch().fetchImpl,
    ...overrides,
  } as Parameters<typeof handshake>[0]
}

function frames(handle: StreamHandle): Promise<unknown[]> {
  return (async () => {
    const out: unknown[] = []
    for await (const ev of handle) out.push(ev)
    return out
  })()
}

describe('parseFrame', () => {
  it('parses objects and rejects junk', () => {
    expect(parseFrame('{"a":1}')).toEqual({ a: 1 })
    expect(parseFrame('  {"a":1}  ')).toEqual({ a: 1 })
    expect(parseFrame('')).toBeNull()
    expect(parseFrame('   ')).toBeNull()
    expect(parseFrame('not json')).toBeNull()
    expect(parseFrame('42')).toBeNull()
    expect(parseFrame('"str"')).toBeNull()
    expect(parseFrame('null')).toBeNull()
  })
})

describe('readLines', () => {
  it('yields trailing data that lacks a final newline', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode('a\nb'))
        c.close()
      },
    })
    const lines: string[] = []
    for await (const line of readLines(stream)) lines.push(line)
    expect(lines).toEqual(['a', 'b'])
  })

  it('reassembles multi-byte characters split across chunks', async () => {
    const encoder = new TextEncoder()
    const bytes = encoder.encode('{"m":"héllo"}\n')
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        // split mid-character: "é" is two bytes
        const splitAt = bytes.indexOf(0xc3)
        c.enqueue(bytes.slice(0, splitAt + 1))
        c.enqueue(bytes.slice(splitAt + 1))
        c.close()
      },
    })
    const lines: string[] = []
    for await (const line of readLines(stream)) lines.push(line)
    expect(JSON.parse(lines[0]!)).toEqual({ m: 'héllo' })
  })
})

describe('handshake status events', () => {
  it('emits forbidden on 403 before failing', async () => {
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      new Response('nope', { status: 403, headers: { reason: 'Not a collaborator' } }),
    )
    const handle = handshake(base({ fetchImpl: mock.fetchImpl }))
    const reasons: string[] = []
    handle.on('forbidden', (r) => reasons.push(r))
    await expect(handle.completed).rejects.toThrow()
    expect(reasons).toEqual(['Not a collaborator'])
  })

  it('emits invalid on 422', async () => {
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      json({ messages: ['domain must be valid.'] }, 422),
    )
    const handle = handshake(base({ fetchImpl: mock.fetchImpl }))
    const seen: string[] = []
    handle.on('invalid', (r) => seen.push(r))
    await expect(handle.completed).rejects.toMatchObject({ status: 422 })
    expect(seen).toHaveLength(1)
  })

  it('emits ratelimited on 429 with the reason header', async () => {
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      new Response('', {
        status: 429,
        headers: { reason: 'try again in 15 minutes' },
      }),
    )
    const handle = handshake(base({ fetchImpl: mock.fetchImpl }))
    const seen: string[] = []
    handle.on('ratelimited', (r) => seen.push(r))
    await expect(handle.completed).rejects.toMatchObject({ status: 429 })
    expect(seen[0]).toContain('15 minutes')
  })

  it('falls back to a generic reason when the header is absent', async () => {
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      new Response('', { status: 401 }),
    )
    const handle = handshake(base({ fetchImpl: mock.fetchImpl }))
    const seen: string[] = []
    handle.on('unauthorized', (r) => seen.push(r))
    await expect(handle.completed).rejects.toThrow()
    expect(seen).toEqual(['Unauthorized'])
  })

  it('rejects with a typed error carrying the body messages', async () => {
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      json({ messages: ['token expired'], details: { token: 'expired' } }, 401),
    )
    const handle = handshake(base({ fetchImpl: mock.fetchImpl }))
    const err = await handle.completed.catch((e: unknown) => e)
    expect((err as Error).name).toBe('SurgeAuthError')
    expect((err as { messages: string[] }).messages).toEqual(['token expired'])
    expect((err as { details: unknown }).details).toEqual({ token: 'expired' })
  })

  it('fails with a network error when the request never starts', async () => {
    const handle = handshake(base({ fetchImpl: failingFetch }))
    const err = await handle.completed.catch((e: unknown) => e)
    expect((err as Error).name).toBe('SurgeNetworkError')
  })
})

describe('handshake frame resilience', () => {
  it('skips garbage lines and non-object frames', async () => {
    const encoder = new TextEncoder()
    const garbage = new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(encoder.encode('this is not json\n'))
          c.enqueue(encoder.encode('42\n'))
          c.enqueue(encoder.encode('{"type":"progress","id":"upload"}\n'))
          c.enqueue(
            encoder.encode(
              '{"type":"info","urls":[],"instances":[],"metadata":{"rev":1}}\n',
            ),
          )
          c.close()
        },
      }),
      { status: 200 },
    )
    const mock = new MockFetch().otherwise(() => garbage)
    const handle = handshake(base({ fetchImpl: mock.fetchImpl }))
    const all = await frames(handle)
    expect(all.some((e) => (e as { type?: string }).type === 'progress')).toBe(true)
    expect(all.some((e) => (e as { type?: string }).type === 'info')).toBe(true)
    await expect(handle.completed).resolves.toBeTruthy()
  })

  it('emits a transport error when the body stream dies mid-read', async () => {
    const encoder = new TextEncoder()
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    const dying = new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          controller = c
          c.enqueue(encoder.encode('{"type":"progress","id":"upload"}\n'))
        },
        pull() {
          controller?.error(new Error('stream reset'))
        },
      }),
      { status: 200 },
    )
    const mock = new MockFetch().otherwise(() => dying)
    const handle = handshake(base({ fetchImpl: mock.fetchImpl }))
    const transport: Error[] = []
    handle.on('transportError', (e) => transport.push(e))
    await expect(handle.completed).rejects.toThrow(/stream reset/)
    expect(transport).toHaveLength(1)
  })

  it('surfaces a no-reason fail when the stream ends without info', async () => {
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      ndjson([{ type: 'progress', id: 'upload' }]),
    )
    const handle = handshake(base({ fetchImpl: mock.fetchImpl }))
    const progress: string[] = []
    handle.on('progress', (p) => progress.push(p.id))
    await expect(handle.completed).rejects.toThrow(
      'stream failed without a reason',
    )
    expect(progress).toEqual(['upload'])
  })

  it('emits response with status and headers before frames', async () => {
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      ndjson([
        { type: 'info', urls: [], instances: [], metadata: { rev: 1 } },
      ]),
    )
    const handle = handshake(base({ fetchImpl: mock.fetchImpl }))
    const response = await new Promise<{ status: number }>((resolve) => {
      handle.once('response', resolve)
    })
    expect(response.status).toBe(200)
    await handle.completed
  })

  it('sends argv and custom headers on the request', async () => {
    const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
      expect(JSON.parse(req.headers['argv'] ?? '{}')).toEqual({ force: 'https' })
      expect(req.headers['x-custom']).toBe('yes')
      expect(req.headers['version']).toBe('1.0.0')
      expect(req.headers['user-agent']).toBe('surgejs-sdk/test')
      expect(req.headers['accept']).toBe('application/x-ndjson')
      return ndjson([
        { type: 'info', urls: [], instances: [], metadata: { rev: 1 } },
      ])
    })
    await handshake(
      base({
        fetchImpl: mock.fetchImpl,
        argv: { force: 'https' },
        headers: { 'x-custom': 'yes' },
      }),
    ).completed
  })

  it('honors a content-type option', async () => {
    const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
      expect(req.headers['content-type']).toBe('application/x-pem-file')
      return ndjson([
        { type: 'info', urls: [], instances: [], metadata: { rev: 1 } },
      ])
    })
    await handshake(
      base({ fetchImpl: mock.fetchImpl, contentType: 'application/x-pem-file' }),
    ).completed
  })
})
