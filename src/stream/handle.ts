import { EventEmitter } from 'node:events'
import type { DeployInfo, StreamEvent, StreamEventMap } from '../types/stream.js'

type Listener<K extends keyof StreamEventMap> = StreamEventMap[K] extends undefined
  ? () => void
  : (payload: StreamEventMap[K]) => void

/** Lifecycle events are not frames — they don't ride the async iterator. */
const LIFECYCLE = new Set<string | symbol>([
  'success',
  'fail',
  'transportError',
  'response',
  'unauthorized',
  'forbidden',
  'invalid',
  'ratelimited',
  'newListener',
  'removeListener',
])

/**
 * Handle for a streaming operation (publish, encrypt, ssl).
 *
 * Three ways to consume the same stream:
 *
 * - **Events** (official-SDK familiar): `handle.on('progress', …)`,
 *   `handle.on('info', …)`, `handle.on('success', …)`, `handle.on('fail', …)`.
 * - **Promise**: `await handle.completed` resolves with the deploy result
 *   (or the cert payload for encrypt/ssl) and rejects with a typed error.
 * - **Async iteration**: `for await (const event of handle)` yields every
 *   frame in order.
 *
 * Unlike a bare EventEmitter, an `error` emission with no listeners does not
 * crash the process — it is recorded for the async iterator and for the
 * `completed` rejection. Promise-only consumers are safe.
 *
 * Treat `success`/`fail` (or `completed`) as the authoritative outcome;
 * `info` merely carries the result payload.
 */
export class StreamHandle<TResult = DeployInfo> extends EventEmitter {
  /** Settles with the success payload, or rejects with the typed failure. */
  readonly completed: Promise<TResult>

  private readonly buffer: StreamEvent[] = []
  private readonly waiters: Array<{
    resolve: (value: IteratorResult<StreamEvent>) => void
  }> = []
  private done = false
  private failure: unknown

  constructor() {
    super()
    this.completed = new Promise<TResult>((resolve, reject) => {
      this.once('success', (payload: unknown) => resolve(payload as TResult))
      this.once('fail', (reason?: unknown) => {
        reject(reason ?? this.failure ?? new Error('stream failed without a reason'))
      })
    })
    // prevent unhandled-rejection noise when callers only use events
    this.completed.catch(() => {})
  }

  override emit(event: string | symbol, ...args: unknown[]): boolean {
    // an 'error' with no listener must not throw: record it instead
    if (event === 'error' && this.listenerCount('error') === 0) {
      this.failure = args[0]
      const frame = args[0]
      if (frame !== undefined) {
        this.buffer.push(frame as StreamEvent)
        this.drain()
      }
      return false
    }

    const frame = args[0]
    if (!LIFECYCLE.has(event) && frame !== undefined) {
      // copy: handshake deletes `type` off the original before the type-named
      // emit, and the iterator must still see the frame as it arrived
      this.buffer.push({ ...(frame as object) } as StreamEvent)
      this.drain()
    }
    if (event === 'success' || event === 'fail') {
      this.done = true
      if (event === 'fail' && frame !== undefined) this.failure = frame
      this.drain()
    }
    return super.emit(event, ...args)
  }

  private drain(): void {
    while (this.waiters.length > 0 && (this.buffer.length > 0 || this.done)) {
      const waiter = this.waiters[0]!
      if (this.buffer.length === 0 && this.done) {
        this.waiters.shift()
        waiter.resolve({ done: true, value: undefined })
        continue
      }
      const value = this.buffer.shift()
      this.waiters.shift()
      /* v8 ignore start: unreachable — the done-and-empty case above always
         resolves first; guards a future drain reorder */
      if (value === undefined) {
        waiter.resolve({ done: true, value: undefined })
      } else {
        /* v8 ignore stop */
        waiter.resolve({ done: false, value })
      }
    }
  }

  /** Yield every frame in order; ends when the stream completes. */
  async *[Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    for (;;) {
      if (this.buffer.length > 0) {
        yield this.buffer.shift()!
        continue
      }
      if (this.done) return
      // sequential by design: one consumer drains frames in arrival order
      // oxlint-disable-next-line no-await-in-loop
      const result = await new Promise<IteratorResult<StreamEvent>>((resolve) => {
        this.waiters.push({ resolve })
      })
      if (result.done) return
      yield result.value
    }
  }

  /** Typed `on` — every event from StreamEventMap plus Node's extras. */
  override on<K extends keyof StreamEventMap>(
    event: K,
    listener: Listener<K>,
  ): this
  override on(event: string | symbol, listener: (...args: unknown[]) => void): this
  override on(
    event: keyof StreamEventMap | string | symbol,
    listener: (...args: never[]) => void,
  ): this {
    return super.on(event as string, listener as (...args: unknown[]) => void)
  }

  /** Typed `once`. */
  override once<K extends keyof StreamEventMap>(
    event: K,
    listener: Listener<K>,
  ): this
  override once(
    event: string | symbol,
    listener: (...args: unknown[]) => void,
  ): this
  override once(
    event: keyof StreamEventMap | string | symbol,
    listener: (...args: never[]) => void,
  ): this {
    return super.once(event as string, listener as (...args: unknown[]) => void)
  }
}
