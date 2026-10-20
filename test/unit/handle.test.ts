import { describe, expect, it, vi } from 'vitest'
import { StreamHandle } from '../../src/stream/handle.js'

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5))
}

describe('StreamHandle', () => {
  it('delivers typed events', async () => {
    const handle = new StreamHandle()
    const seen: Array<{ id: string }> = []
    handle.on('progress', (p) => seen.push({ id: p.id }))
    handle.emit('data', { type: 'progress', id: 'upload' })
    handle.emit('progress', { id: 'upload', written: 1, total: 2 })
    await tick()
    expect(seen).toEqual([{ id: 'upload' }])
  })

  it('resolves completed with the success payload', async () => {
    const handle = new StreamHandle<{ urls: string[] }>()
    handle.emit('info', {
      urls: ['https://x.surge.sh'],
      instances: [],
      metadata: { rev: 1 },
    })
    handle.emit('success', {
      urls: ['https://x.surge.sh'],
      instances: [],
      metadata: { rev: 1 },
    })
    const info = await handle.completed
    expect(info.urls).toEqual(['https://x.surge.sh'])
  })

  it('rejects completed on fail with the reason', async () => {
    const handle = new StreamHandle()
    handle.emit('fail', new Error('boom'))
    await expect(handle.completed).rejects.toThrow('boom')
  })

  it('rejects completed with a bare fail (no reason)', async () => {
    const handle = new StreamHandle()
    handle.emit('fail')
    await expect(handle.completed).rejects.toThrow('stream failed without a reason')
  })

  it('does not crash on error events with no listener', async () => {
    const handle = new StreamHandle()
    // would throw on a bare EventEmitter
    handle.emit('error', { error: { message: 'server said no' } })
    handle.emit('fail', new Error('server said no'))
    await expect(handle.completed).rejects.toThrow('server said no')
  })

  it('queues frames for late async iterators', async () => {
    const handle = new StreamHandle()
    handle.emit('data', { type: 'progress', id: 'upload' })
    handle.emit('data', { type: 'progress', id: 'cdn' })
    handle.emit('success', { urls: [], instances: [], metadata: { rev: 1 } })

    const seen: string[] = []
    for await (const frame of handle) {
      if (frame.type === 'progress') seen.push(frame.id)
    }
    expect(seen).toEqual(['upload', 'cdn'])
  })

  it('supports an iterator attached before events arrive', async () => {
    const handle = new StreamHandle()
    const collected: string[] = []
    const iterate = (async () => {
      for await (const frame of handle) {
        collected.push(frame.type)
      }
    })()
    await tick()
    handle.emit('data', { type: 'progress', id: 'upload' })
    handle.emit('success', { urls: [], instances: [], metadata: { rev: 1 } })
    await iterate
    expect(collected).toEqual(['progress'])
  })

  it('never buffers lifecycle frames for iterators', async () => {
    const handle = new StreamHandle()
    handle.emit('response', { status: 200, headers: {} })
    handle.emit('data', { type: 'progress', id: 'upload' })
    handle.emit('success', { urls: [], instances: [], metadata: { rev: 1 } })
    const types: string[] = []
    for await (const frame of handle) types.push(frame.type)
    expect(types).toEqual(['progress'])
  })

  it('rejects completed only once even with multiple fail listeners', async () => {
    const handle = new StreamHandle()
    const onFail = vi.fn()
    handle.on('fail', onFail)
    handle.emit('fail', new Error('x'))
    await expect(handle.completed).rejects.toThrow('x')
    expect(onFail).toHaveBeenCalledOnce()
  })

  it('ends a parked iterator when success arrives with no frames', async () => {
    const handle = new StreamHandle()
    const collected: string[] = []
    const iterate = (async () => {
      for await (const frame of handle) collected.push(frame.type)
    })()
    await tick()
    handle.emit('success', { urls: [], instances: [], metadata: { rev: 1 } })
    await iterate
    expect(collected).toEqual([])
  })

  it('buffers error frames for iterators while calling listeners', async () => {
    const handle = new StreamHandle()
    const onError = vi.fn()
    handle.on('error', onError)
    handle.emit('error', { error: { message: 'server abort' } })
    handle.emit('success', { urls: [], instances: [], metadata: { rev: 1 } })
    expect(onError).toHaveBeenCalledOnce()
    const frames: unknown[] = []
    for await (const frame of handle) frames.push(frame)
    // the error frame has no type field — it still rides the iterator
    expect(frames).toHaveLength(1)
    expect(frames[0]).toEqual({ error: { message: 'server abort' } })
  })

  it('returns false from emit when an unlistened error is intercepted', () => {
    const handle = new StreamHandle()
    expect(handle.emit('error', { error: { message: 'x' } })).toBe(false)
  })

  it('supports removeListener from EventEmitter', async () => {
    const handle = new StreamHandle()
    const fn = vi.fn()
    handle.on('progress', fn)
    handle.removeAllListeners('progress')
    handle.emit('progress', { id: 'upload' })
    expect(fn).not.toHaveBeenCalled()
  })
})
