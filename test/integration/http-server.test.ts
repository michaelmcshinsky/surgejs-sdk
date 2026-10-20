import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it, afterAll, beforeAll } from 'vitest'
import { createClient } from '../../src/index.js'
import type { DeployInfo } from '../../src/types/index.js'
import { TempProject } from '../helpers/temp-project.js'
import { readTar } from '../helpers/tar-reader.js'

/**
 * End-to-end against a real Node HTTP server: this exercises undici's
 * duplex streaming of the Node Readable tarball body — the path mock fetch
 * cannot prove. The server gunzips and extracts the archive, then answers
 * with the real NDJSON protocol.
 */

let server: Server
let endpoint: string
let received: { headers: Record<string, string | string[] | undefined>; tarNames: string[]; contents: Record<string, string> } | null = null

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.method === 'PUT' && req.url === '/e2e.surge.sh') {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        try {
          const tar = readTar(gunzipSync(Buffer.concat(chunks)))
          received = {
            headers: req.headers,
            tarNames: tar.map((e) => e.name),
            contents: Object.fromEntries(
              tar.map((e) => [e.name, e.content.toString()]),
            ),
          }
          res.writeHead(200, { 'content-type': 'application/x-ndjson' })
          res.write(
            `${JSON.stringify({ type: 'progress', id: 'upload', written: 10, total: 10 })}\n`,
          )
          res.write(
            `${JSON.stringify({
              type: 'info',
              urls: ['https://e2e.surge.sh'],
              instances: [{ host: 'sfo.surge.sh' }],
              metadata: { rev: '1700000000000', message: 'e2e' },
            })}\n`,
          )
          res.end()
        } catch (err) {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ messages: [String(err)] }))
        }
      })
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ messages: ['not found'] }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  endpoint = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('publish over real HTTP', () => {
  it('streams a real tarball the server can extract', async () => {
    const project = new TempProject()
      .file('index.html', '<h1>e2e</h1>')
      .file('assets/style.css', 'body{}')
      .file('.git/config', 'ignored')

    try {
      const c = createClient({ endpoint, token: 'tok' })
      const handle = c.publish(project.path, 'e2e.surge.sh', {
        message: 'e2e',
      })
      const progress: string[] = []
      handle.on('progress', (p) => progress.push(p.id))
      const info = (await handle.completed) as DeployInfo

      expect(info.urls).toEqual(['https://e2e.surge.sh'])
      expect(info.metadata.rev).toBe('1700000000000')
      expect(progress).toEqual(['upload'])

      expect(received).toBeTruthy()
      const dir = project.path.split(/[\\/]/).pop()
      expect(received?.tarNames.sort()).toEqual([
        `${dir}/assets/style.css`,
        `${dir}/index.html`,
      ])
      expect(received?.contents[`${dir}/index.html`]).toBe('<h1>e2e</h1>')
      expect(received?.headers['file-count']).toBe('2')
      expect(received?.headers['message']).toBe('e2e')
      expect(String(received?.headers['authorization'])).toContain('Basic ')
    } finally {
      project.cleanup()
    }
  })

  it('propagates 404 from the server as a typed failure', async () => {
    const c = createClient({ endpoint, token: 'tok' })
    const project = new TempProject().file('index.html', 'x')
    try {
      const handle = c.publish(project.path, 'unknown-route')
      await expect(handle.completed).rejects.toMatchObject({ status: 404 })
    } finally {
      project.cleanup()
    }
  })
})
