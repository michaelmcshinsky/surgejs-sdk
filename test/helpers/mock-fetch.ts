/**
 * A programmable fetch replacement: register handlers per
 * "METHOD /path" and inspect the requests that arrive.
 */

export interface CapturedRequest {
  method: string
  url: string
  headers: Record<string, string>
  init: RequestInit & { duplex?: 'half' }
  /** The body drained to a Buffer (streaming bodies are consumed). */
  body: Buffer | null
}

export type FetchHandler = (
  req: CapturedRequest,
) => Response | Promise<Response> | Promise<void> | void

export class MockFetch {
  readonly requests: CapturedRequest[] = []
  private readonly handlers = new Map<string, FetchHandler>()
  private fallback: FetchHandler | null = null

  on(methodAndPath: string, handler: FetchHandler): this {
    this.handlers.set(methodAndPath.toUpperCase(), handler)
    return this
  }

  otherwise(handler: FetchHandler): this {
    this.fallback = handler
    return this
  }

  /** The fetch function to pass as `fetchImpl`. */
  readonly fetchImpl: typeof globalThis.fetch = async (
    input,
    init = {},
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init.method ?? 'GET').toUpperCase()
    const headers: Record<string, string> = {}
    const raw = init.headers ?? {}
    if (raw instanceof Headers) {
      raw.forEach((v, k) => {
        headers[k.toLowerCase()] = v
      })
    } else if (Array.isArray(raw)) {
      for (const entry of raw) {
        headers[String(entry[0]).toLowerCase()] = String(entry[1])
      }
    } else {
      for (const [k, v] of Object.entries(raw)) {
        if (v !== undefined) headers[k.toLowerCase()] = String(v)
      }
    }

    const body = await drainBody(init.body)
    const req: CapturedRequest = { method, url, headers, init, body }
    this.requests.push(req)

    const key = `${method} ${pathOf(url)}`.toUpperCase()
    const handler = this.handlers.get(key) ?? this.fallback
    if (!handler) {
      return new Response(
        JSON.stringify({ messages: [`no mock for ${key}`] }),
        { status: 599, headers: { 'content-type': 'application/json' } },
      )
    }
    const result = await handler(req)
    if (result instanceof Response) return result
    return new Response('', { status: 200 })
  }

  /** The last request, or undefined. */
  last(): CapturedRequest | undefined {
    return this.requests[this.requests.length - 1]
  }

  /** All requests matching a "METHOD /path" key. */
  matching(methodAndPath: string): CapturedRequest[] {
    const key = methodAndPath.toUpperCase()
    return this.requests.filter(
      (r) => `${r.method} ${pathOf(r.url)}`.toUpperCase() === key,
    )
  }
}

function pathOf(url: string): string {
  try {
    const u = new URL(url)
    return `${u.pathname}${u.search}`
  } catch {
    return url
  }
}

async function drainBody(body: RequestInit['body']): Promise<Buffer | null> {
  if (body === undefined || body === null) return null
  if (typeof body === 'string') return Buffer.from(body)
  if (body instanceof Uint8Array) return Buffer.from(body)
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  // Node Readable / web stream / async iterable
  const chunks: Buffer[] = []
  const iterable = body as AsyncIterable<Uint8Array | string>
  for await (const chunk of iterable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/** JSON response helper. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** NDJSON response from an array of frames. */
export function ndjson(frames: Array<Record<string, unknown>>, status = 200): Response {
  const text = `${frames.map((f) => JSON.stringify(f)).join('\n')}\n`
  const bytes = new TextEncoder().encode(text)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  return new Response(stream, {
    status,
    headers: { 'content-type': 'application/x-ndjson' },
  })
}

/** NDJSON response streamed in separate chunks (to exercise line splitting). */
export function ndjsonChunked(
  frames: Array<Record<string, unknown>>,
  status = 200,
): Response {
  const encoder = new TextEncoder()
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= frames.length) {
        controller.close()
        return
      }
      // one frame per pull, sometimes split mid-line
      const line = `${JSON.stringify(frames[i++])}\n`
      const half = Math.floor(line.length / 2)
      controller.enqueue(encoder.encode(line.slice(0, half)))
      if (half < line.length) {
        controller.enqueue(encoder.encode(line.slice(half)))
      }
    },
  })
  return new Response(stream, {
    status,
    headers: { 'content-type': 'application/x-ndjson' },
  })
}

/** Empty-body response. */
export function empty(status = 200): Response {
  return new Response(null, { status })
}
