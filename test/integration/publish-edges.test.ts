import { describe, expect, it } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import { symlinkSync, rmSync } from 'node:fs'
import { createClient } from '../../src/index.js'
import { MockFetch, json, ndjson } from '../helpers/mock-fetch.js'
import { TempProject } from '../helpers/temp-project.js'
import { readTar } from '../helpers/tar-reader.js'

const SUCCESS = [
  {
    type: 'info',
    urls: ['https://x.surge.sh'],
    instances: [],
    metadata: { rev: '1' },
  },
]

function client(mock: MockFetch) {
  return createClient({
    endpoint: 'https://api.test',
    token: 'tok',
    fetch: mock.fetchImpl,
  })
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

describe('publish edges', () => {
  it('fails before any request when the project path is missing', async () => {
    const mock = new MockFetch()
    const handle = client(mock).publish(
      join(process.cwd(), '__definitely_missing_project__'),
      'x.surge.sh',
    )
    await expect(handle.completed).rejects.toThrow()
    expect(mock.requests).toHaveLength(0)
  })

  it('packs zero-byte files', async () => {
    const project = new TempProject()
      .file('index.html', '<h1>x</h1>')
      .file('empty.txt', '')
    const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
      const tar = readTar(gunzipSync(req.body!))
      const empty = tar.find((e) => e.name.endsWith('empty.txt'))
      expect(empty?.size).toBe(0)
      return ndjson(SUCCESS)
    })
    try {
      await client(mock).publish(project.path, 'x.surge.sh').completed
    } finally {
      project.cleanup()
    }
  })

  it('publishes a single file with local references it would leave behind', async () => {
    const project = new TempProject()
      .file('page.html', '<link href="style.css"><img src="missing.png">')
      .file('style.css', 'body{}')
    const mock = new MockFetch().on('PUT /one.surge.sh', () => ndjson(SUCCESS))
    try {
      const handle = client(mock).publish(
        join(project.path, 'page.html'),
        'one.surge.sh',
      )
      const singles: Array<{ file: string; as: string; local: string[] }> = []
      handle.on('single', (s) => singles.push(s))
      await handle.completed
      // style.css exists beside the page and rides along; missing.png does not
      expect(singles[0]?.local).toEqual(['style.css'])
    } finally {
      project.cleanup()
    }
  })

  it('reports onProgress through the option as well as the event', async () => {
    const project = new TempProject().file('index.html', 'x')
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      ndjson([
        { type: 'progress', id: 'upload', written: 5, total: 10 },
        SUCCESS[0]!,
      ]),
    )
    try {
      const seen: string[] = []
      await client(mock).publish(project.path, 'x.surge.sh', {
        onProgress: (p) => seen.push(p.id),
      }).completed
      expect(seen).toEqual(['upload'])
    } finally {
      project.cleanup()
    }
  })

  it('accepts stage: false without sending the header', async () => {
    const project = new TempProject().file('index.html', 'x')
    const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
      expect(req.headers['stage']).toBeUndefined()
      return ndjson(SUCCESS)
    })
    try {
      await client(mock).publish(project.path, 'x.surge.sh', {
        stage: false,
      }).completed
    } finally {
      project.cleanup()
    }
  })

  it('falls back to a full upload when the carry reply is not JSON', async () => {
    const project = new TempProject()
      .file('index.html', '<h1>big</h1>')
      .bigFile('big.bin', 1_200_000)
    const mock = new MockFetch()
      .on('POST /x.surge.sh/carry', () => new Response('not json', { status: 200 }))
      .on('PUT /x.surge.sh', (req) => {
        expect(req.headers['carry-ticket']).toBeUndefined()
        return ndjson(SUCCESS)
      })
    try {
      await client(mock).publish(project.path, 'x.surge.sh').completed
      expect(mock.matching('PUT /x.surge.sh')).toHaveLength(1)
      const tar = readTar(gunzipSync(mock.last()!.body!))
      expect(tar).toHaveLength(2)
    } finally {
      project.cleanup()
    }
  })

  it('falls back to a full upload when carry responds non-200', async () => {
    const project = new TempProject()
      .file('index.html', '<h1>big</h1>')
      .bigFile('big.bin', 1_200_000)
    const mock = new MockFetch()
      .on('POST /x.surge.sh/carry', () => json({ msg: 'no' }, 404))
      .on('PUT /x.surge.sh', () => ndjson(SUCCESS))
    try {
      await client(mock).publish(project.path, 'x.surge.sh').completed
      const tar = readTar(gunzipSync(mock.last()!.body!))
      expect(tar).toHaveLength(2)
    } finally {
      project.cleanup()
    }
  })

  it('falls back to a full upload when carry replies without a ticket', async () => {
    const project = new TempProject()
      .file('index.html', '<h1>big</h1>')
      .bigFile('big.bin', 1_200_000)
    const mock = new MockFetch()
      .on('POST /x.surge.sh/carry', () => json({ missing: ['big.bin'] }))
      .on('PUT /x.surge.sh', () => ndjson(SUCCESS))
    try {
      await client(mock).publish(project.path, 'x.surge.sh').completed
      const tar = readTar(gunzipSync(mock.last()!.body!))
      expect(tar).toHaveLength(2)
    } finally {
      project.cleanup()
    }
  })

  it('falls back to a full upload when hashing a carried file fails', async () => {
    const project = new TempProject()
      .file('index.html', '<h1>big</h1>')
      .bigFile('big.bin', 1_200_000)
    const bigPath = join(project.path, 'big.bin')
    const mock = new MockFetch()
      .on('POST /x.surge.sh/carry', () =>
        json({ ticket: 't', missing: ['big.bin'] }),
      )
      .on('PUT /x.surge.sh', () => ndjson(SUCCESS))
    try {
      const handle = client(mock).publish(project.path, 'x.surge.sh')
      // delete after the synchronous scan but before the lazy stream open —
      // hashing big.bin then fails, carry is abandoned, no ticket is sent
      rmSync(bigPath)
      await handle.completed.catch(() => {})
      const put = mock.matching('PUT /x.surge.sh')[0]
      expect(put?.headers['carry-ticket']).toBeUndefined()
    } finally {
      project.cleanup()
    }
  })

  it('falls back to a full upload when the carry request itself fails', async () => {
    const project = new TempProject()
      .file('index.html', '<h1>big</h1>')
      .bigFile('big.bin', 1_200_000)
    const inner = new MockFetch()
      .on('PUT /x.surge.sh', () => ndjson(SUCCESS))
      .otherwise(() => {
        throw new Error('carry socket died')
      })
    const failingCarry: typeof globalThis.fetch = (url, init) => {
      if (String(url).includes('/carry')) {
        return Promise.reject(
          Object.assign(new Error('fetch failed'), {
            cause: Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }),
          }),
        )
      }
      return inner.fetchImpl(url, init)
    }
    try {
      const c = createClient({
        endpoint: 'https://api.test',
        token: 'tok',
        fetch: failingCarry,
      })
      await c.publish(project.path, 'x.surge.sh').completed
      const tar = readTar(gunzipSync(inner.matching('PUT /x.surge.sh')[0]!.body!))
      expect(tar).toHaveLength(2)
    } finally {
      project.cleanup()
    }
  })

  it('streams a carried large file under backpressure', async () => {
    // 4 MB crosses the 1 MB highWaterMark repeatedly, exercising the
    // pause/resume path in the tar stream's data handler
    const project = new TempProject()
      .file('index.html', '<h1>big</h1>')
      .bigFile('big.bin', 4 * 1024 * 1024)
    const mock = new MockFetch()
      .on('POST /x.surge.sh/carry', () =>
        json({ ticket: 't', missing: ['big.bin'] }),
      )
      .on('PUT /x.surge.sh', (req) => {
        const tar = readTar(gunzipSync(req.body!))
        expect(tar).toHaveLength(1)
        expect(tar[0]?.size).toBe(4 * 1024 * 1024)
        return ndjson(SUCCESS)
      })
    try {
      await client(mock).publish(project.path, 'x.surge.sh').completed
    } finally {
      project.cleanup()
    }
  }, 60_000)

  it('refuses a project over the real file-count limit before uploading', async () => {
    const project = new TempProject()
    try {
      for (let i = 0; i < 10_101; i++) project.file(`f${i}.txt`, 'x')
      const mock = new MockFetch()
      const handle = client(mock).publish(project.path, 'big.surge.sh')
      await expect(handle.completed).rejects.toThrow(/platform limit/)
      expect(mock.requests).toHaveLength(0)
    } finally {
      project.cleanup()
    }
  }, 120_000)

  it('skips and reports a dangling link (symlink or junction)', async () => {
    const project = new TempProject().file('index.html', 'x')
    try {
      let linked = false
      try {
        symlinkSync(join(project.path, 'nowhere'), join(project.path, 'dangling'))
        linked = true
      } catch {
        try {
          // junctions need no privileges on Windows
          symlinkSync(
            join(project.path, 'nowhere'),
            join(project.path, 'dangling'),
            'junction',
          )
          linked = true
        } catch {
          // neither form allowed — nothing to assert on this platform
        }
      }
      if (!linked) return
      const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
        const tar = readTar(gunzipSync(req.body!))
        expect(tar.map((e) => e.name)).not.toContain(
          `${basename(project.path)}/dangling`,
        )
        return ndjson(SUCCESS)
      })
      const handle = client(mock).publish(project.path, 'x.surge.sh')
      const skipped: string[][] = []
      handle.on('skipped', (s) => skipped.push(s))
      await handle.completed
      expect(skipped[0]).toContain('dangling')
    } finally {
      project.cleanup()
    }
  })

  it('skips a fifo when the platform can create one', async () => {
    if (process.platform === 'win32') return
    const { execFileSync } = await import('node:child_process')
    const project = new TempProject().file('index.html', 'x')
    try {
      execFileSync('mkfifo', [join(project.path, 'pipe')])
      const mock = new MockFetch().on('PUT /x.surge.sh', () => ndjson(SUCCESS))
      const handle = client(mock).publish(project.path, 'x.surge.sh')
      const skipped: string[][] = []
      handle.on('skipped', (s) => skipped.push(s))
      await handle.completed
      expect(skipped[0]).toContain('pipe')
    } finally {
      project.cleanup()
    }
  })

  it('skips a directory symlink that loops back to an ancestor', async () => {
    const project = new TempProject().file('index.html', 'x')
    try {
      let linked = false
      try {
        symlinkSync(project.path, join(project.path, 'loop'), 'dir')
        linked = true
      } catch {
        try {
          symlinkSync(project.path, join(project.path, 'loop'), 'junction')
          linked = true
        } catch {
          // neither form allowed — nothing to assert on this platform
        }
      }
      if (!linked) return
      const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
        const tar = readTar(gunzipSync(req.body!))
        expect(tar.map((e) => e.name)).toEqual([
          `${basename(project.path)}/index.html`,
        ])
        return ndjson(SUCCESS)
      })
      const handle = client(mock).publish(project.path, 'x.surge.sh')
      const skipped: string[][] = []
      handle.on('skipped', (s) => skipped.push(s))
      await handle.completed
      expect(skipped[0]).toContain('loop')
    } finally {
      project.cleanup()
    }
  })

  it('publishes with no credentials configured', async () => {
    const project = new TempProject().file('index.html', 'x')
    const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
      expect(req.headers['authorization']).toBeUndefined()
      return ndjson(SUCCESS)
    })
    try {
      const bare = createClient({
        endpoint: 'https://api.test',
        fetch: mock.fetchImpl,
      })
      await bare.publish(project.path, 'x.surge.sh').completed
    } finally {
      project.cleanup()
    }
  })

  it('accepts a custom stage value', async () => {
    const project = new TempProject().file('index.html', 'x')
    const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
      expect(req.headers['stage']).toBe('preview-2')
      return ndjson(SUCCESS)
    })
    try {
      await client(mock).publish(project.path, 'x.surge.sh', {
        stage: 'preview-2',
      }).completed
    } finally {
      project.cleanup()
    }
  })

  it('names a dotfile html single-file project "project"', async () => {
    const project = new TempProject().file('.html', '<p>dotfile</p>')
    const mock = new MockFetch().on('PUT /dot.surge.sh', (req) => {
      const tar = readTar(gunzipSync(req.body!))
      expect(tar[0]?.name).toBe('project/index.html')
      return ndjson(SUCCESS)
    })
    try {
      await client(mock).publish(join(project.path, '.html'), 'dot.surge.sh')
        .completed
    } finally {
      project.cleanup()
    }
  })
})
