/**
 * Command implementations for the `surgejs` CLI.
 *
 * Split from the `bin` entry so tests can import and drive it directly. The
 * entry file exists only to add the shebang and call `main()`.
 */
import process from 'node:process'
import { createClient } from '../client.js'
import { SDK_VERSION } from '../version.js'
import type { DeployProgress } from '../types/index.js'
import type { StreamHandle } from '../stream/handle.js'
import { UsageError, flagList, flagValue, parseArgs, type ParsedArgs } from './args.js'

/** Injection points for tests and proxies. */
export interface RunDeps {
  fetch?: typeof globalThis.fetch
}

export const HELP: string = `surgejs ${SDK_VERSION} — publish to Surge from the command line

Usage:
  surgejs publish [path] <domain> [options]
  surgejs list
  surgejs teardown <domain> --yes
  surgejs whoami

Options:
  --token <token>        Surge token (default: $SURGE_TOKEN)
  --endpoint <url>       API endpoint override
  --message <text>       Revision message shown in the project history
  --stage <name>         Publish a preview named <name> instead of production
  --force <http|https>   Force the protocol for the project
  --private              Require sign-in for the whole domain
  --add <emails>         Collaborators to add, comma separated
  --rem <emails>         Collaborators to remove, comma separated
  --yes                  Skip the confirmation on teardown
  -h, --help             Show this message
  -v, --version          Print the version

Examples:
  surgejs publish ./dist my-site.surge.sh
  surgejs publish ./dist my-site.surge.sh --message "release 2.4.0"
  surgejs publish ./dist my-site.surge.sh --stage qa --private
  SURGE_TOKEN=$TOKEN surgejs list
`

/** Format a byte count for the progress line. */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '?'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

/** One line of progress, written to stderr so stdout stays pipeable. */
export function progressLine(progress: DeployProgress): string {
  const phase = progress.id
  if (progress.written !== undefined && progress.total !== undefined) {
    const pct =
      progress.total > 0
        ? Math.round((progress.written / progress.total) * 100)
        : 0
    return `${phase} ${formatBytes(progress.written)} / ${formatBytes(progress.total)} (${pct}%)`
  }
  if (progress.file) return `${phase} ${progress.file}`
  return phase
}

function writeOut(line: string): void {
  process.stdout.write(`${line}\n`)
}

function writeErr(line: string): void {
  process.stderr.write(`${line}\n`)
}

/** Build a client from global flags. */
function clientFor(args: ParsedArgs, deps: RunDeps) {
  const token = flagValue(args, 'token')
  const endpoint = flagValue(args, 'endpoint')
  return createClient({
    ...(token === undefined ? {} : { token }),
    ...(endpoint === undefined ? {} : { endpoint }),
    ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
  })
}

/** Wire stream frames to a single-line renderer. Exported for tests. */
export function attachProgress(
  handle: Pick<StreamHandle, 'on'>,
  render: (line: string) => void,
): void {
  handle.on('progress', (progress) => render(progressLine(progress)))
  handle.on('msg', ({ payload }) => render(payload.msg))
  handle.on('carry', ({ carried, sent }) =>
    render(`carry ${carried} unchanged file(s), sending ${sent}`),
  )
  handle.on('single', (single) =>
    render(`single file ${single.file} served as ${single.as}`),
  )
}

async function runPublish(args: ParsedArgs, deps: RunDeps): Promise<number> {
  const [first, second] = args.positionals
  if (!first) throw new UsageError('publish needs a domain')

  // `publish ./dist site.com` or `publish site.com`
  const path = second === undefined ? '.' : first
  const domain = second === undefined ? first : second

  const force = flagValue(args, 'force')
  if (force !== undefined && force !== 'http' && force !== 'https') {
    throw new UsageError('--force must be "http" or "https"')
  }

  const client = clientFor(args, deps)
  const message = flagValue(args, 'message')
  const stage = flagValue(args, 'stage')
  const add = flagList(args, 'add')
  const rem = flagList(args, 'rem')

  const handle = client.publish(path, domain, {
    ...(message === undefined ? {} : { message }),
    ...(stage === undefined ? {} : { stage }),
    ...(force === undefined ? {} : { force }),
    ...(args.flags['private'] === true ? { private: true } : {}),
    ...(add === undefined ? {} : { add }),
    ...(rem === undefined ? {} : { rem }),
    cmd: 'surgejs',
  })

  let lastLine = ''
  const render = (line: string): void => {
    if (line === lastLine) return
    lastLine = line
    writeErr(line)
  }

  attachProgress(handle, render)

  const info = await handle.completed

  for (const url of info.urls) writeOut(url)
  if (info.cta) writeErr(info.cta)
  return 0
}

async function runList(args: ParsedArgs, deps: RunDeps): Promise<number> {
  const client = clientFor(args, deps)
  const projects = await client.projects.list()

  if (projects.length === 0) {
    writeOut('No projects on this account.')
    return 0
  }

  // Column widths come from the data, so the output stays aligned without a dep.
  const rows = projects.map((project) => [
    project.domain,
    project.rev === undefined ? '' : String(project.rev),
    project.timeAgoInWords ?? '',
    project.message ?? '',
  ])
  const header = ['DOMAIN', 'REV', 'UPDATED', 'MESSAGE']
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column]!.length)),
  )

  const line = (cells: string[]): string =>
    cells
      .map((cell, column) => cell.padEnd(widths[column]!))
      .join('  ')
      .trimEnd()

  writeOut(line(header))
  for (const row of rows) writeOut(line(row))
  return 0
}

async function runTeardown(args: ParsedArgs, deps: RunDeps): Promise<number> {
  const domain = args.positionals[0]
  if (!domain) throw new UsageError('teardown needs a domain')
  if (args.flags['yes'] !== true) {
    throw new UsageError(
      `teardown deletes ${domain} and every revision. Re-run with --yes to confirm.`,
    )
  }

  const client = clientFor(args, deps)
  await client.projects.teardown(domain)
  writeOut(`Removed ${domain}.`)
  return 0
}

async function runWhoami(args: ParsedArgs, deps: RunDeps): Promise<number> {
  const client = clientFor(args, deps)
  const account = await client.account.get()

  writeOut(account.email)
  if (account.plan?.name) writeOut(`plan: ${account.plan.name}`)
  writeOut(`email: ${account.email_verified_at ? 'verified' : 'not verified'}`)
  return 0
}

/** Dispatch one parsed invocation. Exported for tests. */
export async function run(
  argv: readonly string[],
  deps: RunDeps = {},
): Promise<number> {
  const args = parseArgs(argv)

  if (args.flags['version'] === true) {
    writeOut(SDK_VERSION)
    return 0
  }
  if (
    args.flags['help'] === true ||
    args.command === '' ||
    args.command === 'help'
  ) {
    writeOut(HELP.trimEnd())
    return 0
  }

  switch (args.command) {
    case 'publish':
      return runPublish(args, deps)
    case 'list':
      return runList(args, deps)
    case 'teardown':
      return runTeardown(args, deps)
    case 'whoami':
      return runWhoami(args, deps)
    default:
      throw new UsageError(`unknown command "${args.command}"`)
  }
}

/** CLI entry point: run, map errors to messages and exit codes. */
export async function main(
  argv: readonly string[],
  deps: RunDeps = {},
): Promise<number> {
  try {
    return await run(argv, deps)
  } catch (error) {
    if (error instanceof UsageError) {
      writeErr(`error: ${error.message}`)
      writeErr('Run "surgejs --help" for usage.')
      return error.exitCode
    }
    writeErr(`error: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}
