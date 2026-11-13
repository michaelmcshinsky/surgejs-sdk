import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  attachProgress,
  formatBytes,
  main,
  progressLine,
  run,
} from '../../src/cli/run.js'
import {
  UsageError,
  flagList,
  flagValue,
  parseArgs,
} from '../../src/cli/args.js'
import { StreamHandle } from '../../src/stream/handle.js'
import { MockFetch, json, ndjson } from '../helpers/mock-fetch.js'
import { TempProject } from '../helpers/temp-project.js'

const TOKEN = 'cli-token'
const ENDPOINT = 'https://api.test'

/** Collect everything the CLI writes to stdout/stderr. */
function capture(): {
  out: string[]
  err: string[]
  restore: () => void
} {
  const out: string[] = []
  const err: string[] = []
  const outSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
  const errSpy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: unknown) => {
      err.push(String(chunk))
      return true
    })
  return {
    out,
    err,
    restore: () => {
      outSpy.mockRestore()
      errSpy.mockRestore()
    },
  }
}

const global = ['--token', TOKEN, '--endpoint', ENDPOINT]

describe('parseArgs', () => {
  it('separates the command from positionals', () => {
    expect(parseArgs(['publish', './dist', 'x.surge.sh'])).toEqual({
      command: 'publish',
      positionals: ['./dist', 'x.surge.sh'],
      flags: {},
    })
  })

  it('reads value flags in both forms', () => {
    expect(parseArgs(['publish', 'x.surge.sh', '--message', 'hi']).flags).toEqual({
      message: 'hi',
    })
    expect(parseArgs(['publish', 'x.surge.sh', '--message=hi']).flags).toEqual({
      message: 'hi',
    })
  })

  it('reads boolean flags and short aliases', () => {
    expect(parseArgs(['publish', 'x.surge.sh', '--private']).flags).toEqual({
      private: true,
    })
    expect(parseArgs(['-h']).flags).toEqual({ help: true })
    expect(parseArgs(['-v']).flags).toEqual({ version: true })
  })

  it('stops flag parsing at --', () => {
    const parsed = parseArgs(['publish', '--', '--weird-dir', 'x.surge.sh'])
    expect(parsed.positionals).toEqual(['--weird-dir', 'x.surge.sh'])
    expect(parsed.flags).toEqual({})
  })

  it('rejects unknown flags', () => {
    expect(() => parseArgs(['--nope'])).toThrow(UsageError)
  })

  it('rejects a value flag with no value', () => {
    expect(() => parseArgs(['--message'])).toThrow(/needs a value/)
    expect(() => parseArgs(['--message', '--private'])).toThrow(/needs a value/)
  })

  it('rejects a value on a boolean flag', () => {
    expect(() => parseArgs(['--private=yes'])).toThrow(/does not take a value/)
  })

  it('rejects unknown short flags', () => {
    expect(() => parseArgs(['-x'])).toThrow(/unknown flag "-x"/)
  })
})

describe('flag accessors', () => {
  it('reads a value flag and ignores booleans', () => {
    expect(flagValue(parseArgs(['--message', 'hi']), 'message')).toBe('hi')
    expect(flagValue(parseArgs(['--private']), 'private')).toBeUndefined()
    expect(flagValue(parseArgs([]), 'message')).toBeUndefined()
  })

  it('splits comma-separated lists and drops blanks', () => {
    expect(flagList(parseArgs(['--add', 'a@b.c, d@e.f']), 'add')).toEqual([
      'a@b.c',
      'd@e.f',
    ])
    expect(flagList(parseArgs(['--add', ' , ']), 'add')).toEqual([])
    expect(flagList(parseArgs([]), 'add')).toBeUndefined()
  })
})

describe('attachProgress', () => {
  it('renders every frame type as one line', () => {
    const lines: string[] = []
    const handle = new StreamHandle()
    attachProgress(handle, (line) => {
      lines.push(line)
    })

    handle.emit('progress', { id: 'upload', written: 1, total: 2 })
    handle.emit('msg', { payload: { msg: 'compiling' } })
    handle.emit('carry', { carried: 2, sent: 1 })
    handle.emit('single', {
      file: 'a.html',
      as: 'index.html',
      local: [],
    })

    expect(lines).toEqual([
      'upload 1 B / 2 B (50%)',
      'compiling',
      'carry 2 unchanged file(s), sending 1',
      'single file a.html served as index.html',
    ])
  })
})

describe('output helpers', () => {
  it('formats byte counts', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(undefined)).toBe('?')
  })

  it('renders a progress line with a percentage', () => {
    expect(progressLine({ id: 'upload', written: 50, total: 100 })).toBe(
      'upload 50 B / 100 B (50%)',
    )
    expect(progressLine({ id: 'cdn', file: 'index.html' })).toBe(
      'cdn index.html',
    )
    expect(progressLine({ id: 'upload' })).toBe('upload')
    expect(progressLine({ id: 'upload', written: 1, total: 0 })).toBe(
      'upload 1 B / 0 B (0%)',
    )
  })
})

describe('surgejs CLI', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints help when no command is given', async () => {
    const io = capture()
    try {
      expect(await run([])).toBe(0)
      expect(io.out.join('')).toContain('surgejs publish')
    } finally {
      io.restore()
    }
  })

  it('prints the version', async () => {
    const io = capture()
    try {
      expect(await run(['--version'])).toBe(0)
      expect(io.out.join('').trim()).toMatch(/^\d+\.\d+\.\d+/)
    } finally {
      io.restore()
    }
  })

  it('lists projects in columns', async () => {
    const mock = new MockFetch().on('GET /list', () =>
      json([
        {
          domain: 'a.surge.sh',
          rev: 3,
          timeAgoInWords: '2 days ago',
          message: 'first',
        },
        { domain: 'a-very-long-name.surge.sh', rev: 4, message: null },
      ]),
    )
    const io = capture()
    try {
      const code = await run(['list', ...global], { fetch: mock.fetchImpl })
      const text = io.out.join('')
      expect(code).toBe(0)
      expect(text).toContain('DOMAIN')
      expect(text).toContain('a-very-long-name.surge.sh')
    } finally {
      io.restore()
    }
  })

  it('reports an empty account', async () => {
    const mock = new MockFetch().on('GET /list', () => json([]))
    const io = capture()
    try {
      expect(await run(['list', ...global], { fetch: mock.fetchImpl })).toBe(0)
      expect(io.out.join('')).toContain('No projects')
    } finally {
      io.restore()
    }
  })

  it('publishes a directory and prints the resulting URLs', async () => {
    const project = new TempProject().file('index.html', '<h1>hi</h1>')
    const mock = new MockFetch().on('PUT /cli.surge.sh', (req) => {
      expect(req.headers['message']).toBe('from cli')
      return ndjson([
        { type: 'progress', id: 'upload', written: 10, total: 10 },
        {
          type: 'info',
          urls: ['https://cli.surge.sh'],
          instances: [],
          metadata: { rev: '1' },
          cta: 'want a custom domain?',
        },
      ])
    })
    const io = capture()
    try {
      const code = await run(
        [
          'publish',
          project.path,
          'cli.surge.sh',
          '--message',
          'from cli',
          ...global,
        ],
        { fetch: mock.fetchImpl },
      )
      expect(code).toBe(0)
      expect(io.out.join('')).toContain('https://cli.surge.sh')
      expect(io.err.join('')).toContain('upload')
      expect(io.err.join('')).toContain('want a custom domain?')
    } finally {
      io.restore()
      project.cleanup()
    }
  })

  it('defaults the path to the working directory', async () => {
    const mock = new MockFetch().on('PUT /cwd.surge.sh', () =>
      ndjson([
        {
          type: 'info',
          urls: ['https://cwd.surge.sh'],
          instances: [],
          metadata: {},
        },
      ]),
    )
    const io = capture()
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(process.cwd())
    try {
      const code = await run(['publish', 'cwd.surge.sh', ...global], {
        fetch: mock.fetchImpl,
      })
      expect(code).toBe(0)
    } finally {
      cwd.mockRestore()
      io.restore()
    }
  })

  it('requires --yes before tearing a project down', async () => {
    const io = capture()
    try {
      await expect(
        run(['teardown', 'gone.surge.sh', ...global]),
      ).rejects.toThrow(/--yes/)
    } finally {
      io.restore()
    }
  })

  it('tears a project down when confirmed', async () => {
    const mock = new MockFetch().on('DELETE /gone.surge.sh', () => json({}))
    const io = capture()
    try {
      const code = await run(['teardown', 'gone.surge.sh', '--yes', ...global], {
        fetch: mock.fetchImpl,
      })
      expect(code).toBe(0)
      expect(io.out.join('')).toContain('Removed gone.surge.sh')
    } finally {
      io.restore()
    }
  })

  it('prints the account email and plan', async () => {
    const mock = new MockFetch().on('GET /account', () =>
      json({
        email: 'me@example.com',
        email_verified_at: '2024-01-01',
        plan: { name: 'pro' },
      }),
    )
    const io = capture()
    try {
      const code = await run(['whoami', ...global], { fetch: mock.fetchImpl })
      const text = io.out.join('')
      expect(code).toBe(0)
      expect(text).toContain('me@example.com')
      expect(text).toContain('plan: pro')
      expect(text).toContain('email: verified')
    } finally {
      io.restore()
    }
  })

  it('rejects a bad --force value', async () => {
    const io = capture()
    try {
      await expect(
        run(['publish', 'x.surge.sh', '--force', 'ftp', ...global]),
      ).rejects.toThrow(/--force/)
    } finally {
      io.restore()
    }
  })

  it('needs a domain to publish', async () => {
    const io = capture()
    try {
      await expect(run(['publish', ...global])).rejects.toThrow(/needs a domain/)
    } finally {
      io.restore()
    }
  })

  it('maps usage errors to exit code 2 without a stack', async () => {
    const io = capture()
    try {
      expect(await main(['frobnicate'])).toBe(2)
      expect(io.err.join('')).toContain('unknown command')
    } finally {
      io.restore()
    }
  })

  it('maps a network failure to exit code 1', async () => {
    const failing: typeof globalThis.fetch = () =>
      Promise.reject(new Error('connect ECONNREFUSED'))
    const io = capture()
    try {
      expect(await main(['list', ...global], { fetch: failing })).toBe(1)
      expect(io.err.join('')).toContain('error:')
    } finally {
      io.restore()
    }
  })
})
