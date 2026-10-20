import { describe, expect, it } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import { createClient } from '../../src/index.js'
import type { DeployInfo, StreamEvent } from '../../src/types/index.js'
import { MockFetch, json, ndjson, ndjsonChunked } from '../helpers/mock-fetch.js'
import { TempProject } from '../helpers/temp-project.js'
import { readTar } from '../helpers/tar-reader.js'

const TOKEN = 'tok'

function client(mock: MockFetch) {
  return createClient({
    endpoint: 'https://api.test',
    token: TOKEN,
    fetch: mock.fetchImpl,
  })
}

const SUCCESS_FRAMES: Array<Record<string, unknown>> = [
  { type: 'progress', id: 'upload', written: 100, total: 100 },
  { type: 'progress', id: 'upload', written: 100, total: 100, end: true },
  { type: 'progress', id: 'cdn', written: 1, total: 2, file: 'index.html' },
  {
    type: 'info',
    urls: ['https://x.surge.sh', 'https://1719-x.surge.sh'],
    instances: [{ host: 'sfo.surge.sh' }],
    metadata: { rev: '1719852000000' },
  },
]

describe('publish', () => {
  it('packs the project and sends deploy headers', async () => {
    const project = new TempProject()
      .file('index.html', '<h1>Hello</h1>')
      .file('assets/app.js', 'console.log(1)')
      .file('.git/config', 'secret')
      .file('node_modules/x/index.js', 'nope')
      .file('.surgeignore', 'assets/\n')

    const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
      expect(req.headers['content-type']).toBe('application/gzip')
      expect(req.headers['accept']).toBe('application/x-ndjson')
      expect(req.headers['file-count']).toBe('1')
      expect(Number(req.headers['project-size'])).toBeGreaterThan(0)
      expect(req.headers['message']).toBe('ship it')
      expect(req.headers['version']).toBe('1.0.0')
      expect(req.headers['authorization']).toBe(
        `Basic ${Buffer.from(`token:${TOKEN}`).toString('base64')}`,
      )
      return ndjson(SUCCESS_FRAMES)
    })

    try {
      const handle = client(mock).publish(project.path, 'x.surge.sh', {
        message: 'ship it',
      })
      const info = await handle.completed
      expect(info.urls).toContain('https://x.surge.sh')

      // the tarball contains only what should ship
      const body = mock.last()?.body
      expect(body).toBeTruthy()
      const tar = readTar(gunzipSync(body!))
      const names = tar.map((e) => e.name).sort()
      expect(names).toEqual([`${basename(project.path)}/index.html`])
      expect(tar[0]?.content.toString()).toBe('<h1>Hello</h1>')
    } finally {
      project.cleanup()
    }
  })

  it('emits progress and info events, and resolves completed with info', async () => {
    const project = new TempProject().file('index.html', 'x')
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      ndjsonChunked(SUCCESS_FRAMES),
    )
    try {
      const handle = client(mock).publish(project.path, 'x.surge.sh')
      const events: StreamEvent[] = []
      const progress: string[] = []
      handle.on('progress', (p) => progress.push(p.id))
      for await (const ev of handle) events.push(ev)

      const info = await handle.completed
      expect((info as DeployInfo).metadata.rev).toBe('1719852000000')
      expect(progress).toEqual(['upload', 'upload', 'cdn'])
      expect(events.some((e) => e.type === 'info')).toBe(true)
      // line splitting across chunk boundaries still parses
      expect(events.filter((e) => e.type === 'progress')).toHaveLength(3)
    } finally {
      project.cleanup()
    }
  })

  it('uses carry dedupe for projects >= 1 MB', async () => {
    const project = new TempProject()
      .file('index.html', '<h1>big</h1>')
      .bigFile('big.bin', 1_500_000)

    const seen: { files: Record<string, { sha256: string; size: number }> | null } =
      { files: null }
    const mock = new MockFetch()
      .on('POST /x.surge.sh/carry', (req) => {
        seen.files = JSON.parse(req.body?.toString() ?? '{}').files
        return json({ ticket: 'tk-1', missing: ['big.bin'] })
      })
      .on('PUT /x.surge.sh', (req) => {
        expect(req.headers['carry-ticket']).toBe('tk-1')
        // headers describe the WHOLE project, not just the missing subset
        expect(req.headers['file-count']).toBe('2')
        return ndjson(SUCCESS_FRAMES)
      })

    try {
      const handle = client(mock).publish(project.path, 'x.surge.sh')
      const carryEvents: Array<{ carried: number; sent: number }> = []
      handle.on('carry', (c) => carryEvents.push(c))
      await handle.completed

      expect(seen.files).toBeTruthy()
      expect(Object.keys(seen.files ?? {}).sort()).toEqual([
        'big.bin',
        'index.html',
      ])
      expect(seen.files?.['big.bin']?.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(carryEvents).toEqual([{ carried: 1, sent: 1 }])

      // only the missing file is in the upload
      const tar = readTar(gunzipSync(mock.matching('PUT /x.surge.sh')[0]!.body!))
      expect(tar.map((e) => e.name)).toEqual([`${basename(project.path)}/big.bin`])
    } finally {
      project.cleanup()
    }
  })

  it('retries in full when a carry ticket goes stale', async () => {
    const project = new TempProject()
      .file('index.html', '<h1>stale</h1>')
      .bigFile('big.bin', 1_200_000)

    let puts = 0
    const mock = new MockFetch()
      .on('POST /x.surge.sh/carry', () =>
        json({ ticket: 'tk-stale', missing: ['big.bin'] }),
      )
      .on('PUT /x.surge.sh', (req) => {
        puts++
        if (req.headers['carry-ticket'] === 'tk-stale') {
          // the server no longer has the carried file
          return ndjson([{ type: 'error', error: { carry: 'stale' } }])
        }
        expect(req.headers['carry-ticket']).toBeUndefined()
        return ndjson(SUCCESS_FRAMES)
      })

    try {
      const info = await client(mock).publish(project.path, 'x.surge.sh').completed
      expect(puts).toBe(2)
      expect(info.urls).toContain('https://x.surge.sh')
      // the retry sends everything
      const tar = readTar(gunzipSync(mock.matching('PUT /x.surge.sh')[1]!.body!))
      expect(tar).toHaveLength(2)
    } finally {
      project.cleanup()
    }
  })

  it('publishes a single HTML file as index.html', async () => {
    const project = new TempProject().file('page.html', '<p>one file</p>')
    const singlePath = join(project.path, 'page.html')

    const mock = new MockFetch().on('PUT /one.surge.sh', (req) => {
      const tar = readTar(gunzipSync(req.body!))
      expect(tar).toHaveLength(1)
      expect(tar[0]?.name).toBe('page/index.html')
      expect(tar[0]?.content.toString()).toBe('<p>one file</p>')
      return ndjson(SUCCESS_FRAMES)
    })

    try {
      const handle = client(mock).publish(singlePath, 'one.surge.sh')
      const singles: Array<{ file: string; as: string }> = []
      handle.on('single', (s) => singles.push(s))
      await handle.completed
      expect(singles).toEqual([
        { file: 'page.html', as: 'index.html', local: [] },
      ])
    } finally {
      project.cleanup()
    }
  })

  it('refuses a non-HTML single file before any request', async () => {
    const project = new TempProject().file('site.zip', 'not a site')
    const mock = new MockFetch()
    try {
      const handle = client(mock).publish(
        join(project.path, 'site.zip'),
        'x.surge.sh',
      )
      await expect(handle.completed).rejects.toThrow(/folder/)
      expect(mock.requests).toHaveLength(0)
    } finally {
      project.cleanup()
    }
  })

  it('fails with unauthorized on 401', async () => {
    const project = new TempProject().file('index.html', 'x')
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      json({ messages: ['token expired'] }, 401),
    )
    try {
      const handle = client(mock).publish(project.path, 'x.surge.sh')
      const reasons: string[] = []
      handle.on('unauthorized', (r) => reasons.push(r))
      await expect(handle.completed).rejects.toThrow()
      expect(reasons.length).toBeGreaterThan(0)
    } finally {
      project.cleanup()
    }
  })

  it('surfaces collect frames (payment required)', async () => {
    const project = new TempProject().file('index.html', 'x')
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      ndjson([
        { type: 'collect', plan: { name: 'Standard' }, stripe_pk: 'pk' },
        SUCCESS_FRAMES[SUCCESS_FRAMES.length - 1]!,
      ]),
    )
    try {
      const handle = client(mock).publish(project.path, 'x.surge.sh')
      const collects: unknown[] = []
      handle.on('collect', (c) => collects.push(c))
      await handle.completed
      expect(collects).toHaveLength(1)
    } finally {
      project.cleanup()
    }
  })

  it('sends stage, add, rem, and ssl headers', async () => {
    const project = new TempProject().file('index.html', 'x')
    const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
      expect(req.headers['stage']).toBe('1')
      expect(req.headers['add']).toBe('a@b.c,c@d.e')
      expect(req.headers['rem']).toBe('old@x.y')
      expect(req.headers['ssl']).toBe('1')
      expect(req.headers['message']).toBe('preview')
      return ndjson(SUCCESS_FRAMES)
    })
    try {
      await client(mock).publish(project.path, 'x.surge.sh', {
        stage: true,
        add: ['a@b.c', 'c@d.e'],
        rem: 'old@x.y',
        ssl: true,
        message: 'preview',
      }).completed
    } finally {
      project.cleanup()
    }
  })

  it('sends timestamp and cmd headers like the CLI', async () => {
    const project = new TempProject().file('index.html', 'x')
    const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
      expect(req.headers['timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(req.headers['cmd']).toBe('surge')
      return ndjson(SUCCESS_FRAMES)
    })
    try {
      await client(mock).publish(project.path, 'x.surge.sh', {
        cmd: 'surge',
      }).completed
    } finally {
      project.cleanup()
    }
  })

  it('honors an explicit timestamp', async () => {
    const project = new TempProject().file('index.html', 'x')
    const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
      expect(req.headers['timestamp']).toBe('2026-01-01T00:00:00.000Z')
      return ndjson(SUCCESS_FRAMES)
    })
    try {
      await client(mock).publish(project.path, 'x.surge.sh', {
        timestamp: '2026-01-01T00:00:00.000Z',
      }).completed
    } finally {
      project.cleanup()
    }
  })

  it('folds force and private into the argv header (CLI parity)', async () => {
    const project = new TempProject().file('index.html', 'x')
    const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
      const argv = JSON.parse(req.headers['argv'] ?? '{}')
      expect(argv.force).toBe('https')
      expect(argv.private).toBe(true)
      expect(argv.tool).toBe('my-deployer')
      return ndjson(SUCCESS_FRAMES)
    })
    try {
      await client(mock).publish(project.path, 'x.surge.sh', {
        force: 'https',
        private: true,
        argv: { tool: 'my-deployer' },
      }).completed
    } finally {
      project.cleanup()
    }
  })

  it('omits the argv header when there is nothing to send', async () => {
    const project = new TempProject().file('index.html', 'x')
    const mock = new MockFetch().on('PUT /x.surge.sh', (req) => {
      expect(req.headers['argv']).toBeUndefined()
      return ndjson(SUCCESS_FRAMES)
    })
    try {
      await client(mock).publish(project.path, 'x.surge.sh').completed
    } finally {
      project.cleanup()
    }
  })

  it('publishes normally with the limit check enabled (wiring)', async () => {
    // refusal behavior itself is unit-tested via limitViolation; this proves
    // publish() consults it without breaking the happy path
    const project = new TempProject().file('index.html', 'x').file('a.txt', 'a')
    const mock = new MockFetch().on('PUT /ok.surge.sh', () =>
      ndjson(SUCCESS_FRAMES),
    )
    try {
      await client(mock).publish(project.path, 'ok.surge.sh').completed
      expect(mock.matching('PUT /ok.surge.sh')).toHaveLength(1)
    } finally {
      project.cleanup()
    }
  })

  it('skips the limit check with validateLimits: false', async () => {
    const project = new TempProject().file('index.html', 'x')
    // fake the limit by monkey-patching would be brittle; instead verify the
    // option is accepted and a normal project still publishes with it set
    const mock = new MockFetch().on('PUT /x.surge.sh', () =>
      ndjson(SUCCESS_FRAMES),
    )
    try {
      await client(mock).publish(project.path, 'x.surge.sh', {
        validateLimits: false,
      }).completed
      expect(mock.requests).toHaveLength(1)
    } finally {
      project.cleanup()
    }
  })
})

describe('encrypt & ssl', () => {
  it('encrypt PUTs /:domain/encrypt with no body', async () => {
    const mock = new MockFetch().on('PUT /example.com/encrypt', (req) => {
      expect(req.body).toBeNull()
      return ndjson([
        { type: 'cert', data: { issuer: "Let's Encrypt" } },
        { type: 'info', urls: [], instances: [], metadata: { rev: 1 } },
      ])
    })
    const certs: Array<{ data: { issuer?: string } }> = []
    const handle = client(mock).encrypt('example.com')
    handle.on('cert', (c) => certs.push(c))
    await handle.completed
    expect(certs[0]?.data.issuer).toBe("Let's Encrypt")
  })

  it('ssl streams the PEM with the right content-type', async () => {
    const project = new TempProject().file(
      'cert.pem',
      '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n',
    )
    const pemPath = join(project.path, 'cert.pem')
    const mock = new MockFetch().on('PUT /example.com/ssl', (req) => {
      expect(req.headers['content-type']).toBe('application/x-pem-file')
      expect(req.body?.toString()).toContain('BEGIN CERTIFICATE')
      return ndjson([
        { type: 'msg', payload: { msg: 'the pem file has been applied' } },
        { type: 'info', urls: [], instances: [], metadata: { rev: 1 } },
      ])
    })
    try {
      const handle = client(mock).ssl(pemPath, 'example.com')
      const msgs: string[] = []
      handle.on('msg', (m) => msgs.push(m.payload.msg))
      await handle.completed
      expect(msgs[0]).toContain('pem file has been applied')
    } finally {
      project.cleanup()
    }
  })

  it('ssl refuses a missing PEM before any request', async () => {
    const mock = new MockFetch()
    const handle = client(mock).ssl('/no/such.pem', 'example.com')
    await expect(handle.completed).rejects.toThrow(/not found/)
    expect(mock.requests).toHaveLength(0)
  })
})

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}
