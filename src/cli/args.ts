/**
 * Minimal argv parser for the bundled CLI.
 *
 * Deliberately dependency-free: the package's only runtime dependency is
 * `ignore`, and a deploy CLI is not a place to add a parser library. The
 * grammar is small enough to state exactly:
 *
 *   surgejs <command> [positionals...] [--flag] [--flag value] [--flag=value]
 *
 * Flags are declared per command so a typo fails loudly instead of being
 * silently ignored, which is the failure mode that matters when the next
 * thing that happens is a production deploy.
 */

/** A usage error, surfaced with exit code 2 and no stack trace. */
export class UsageError extends Error {
  readonly exitCode = 2

  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

/** Flags that take a value. Everything else in `FLAGS` is boolean. */
const VALUE_FLAGS = new Set([
  'token',
  'message',
  'stage',
  'force',
  'add',
  'rem',
  'endpoint',
])

/** Every flag the CLI accepts, across all commands. */
const KNOWN_FLAGS = new Set([
  ...VALUE_FLAGS,
  'help',
  'version',
  'private',
  'yes',
])

export interface ParsedArgs {
  /** The command name, or the empty string when none was given. */
  command: string
  /** Non-flag arguments, in order. */
  positionals: string[]
  /** Flags, with `true` for booleans and a string for value flags. */
  flags: Record<string, string | true>
}

/**
 * Parse argv (without the leading `node script`).
 *
 * `--` ends flag parsing, so a path that begins with a dash is still
 * publishable.
 *
 * @throws {UsageError} on an unknown flag or a value flag with no value.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = []
  const flags: Record<string, string | true> = {}
  let command = ''

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!

    if (arg === '--') {
      positionals.push(...argv.slice(index + 1))
      break
    }

    if (arg.startsWith('--')) {
      const body = arg.slice(2)
      if (body === '') throw new UsageError('empty flag "----" is not valid')

      const eq = body.indexOf('=')
      const name = eq === -1 ? body : body.slice(0, eq)
      const inlineValue = eq === -1 ? undefined : body.slice(eq + 1)

      if (!KNOWN_FLAGS.has(name)) {
        throw new UsageError(`unknown flag "--${name}"`)
      }

      if (VALUE_FLAGS.has(name)) {
        const value = inlineValue ?? argv[index + 1]
        if (value === undefined || (inlineValue === undefined && value.startsWith('-'))) {
          throw new UsageError(`flag "--${name}" needs a value`)
        }
        if (inlineValue === undefined) index += 1
        flags[name] = value
        continue
      }

      if (inlineValue !== undefined) {
        throw new UsageError(`flag "--${name}" does not take a value`)
      }
      flags[name] = true
      continue
    }

    // A leading dash that is not `--` is a short flag. Only -h/-v exist.
    if (arg.startsWith('-') && arg !== '-') {
      if (arg === '-h') {
        flags.help = true
        continue
      }
      if (arg === '-v') {
        flags.version = true
        continue
      }
      throw new UsageError(`unknown flag "${arg}"`)
    }

    if (command === '' && positionals.length === 0) {
      command = arg
      continue
    }
    positionals.push(arg)
  }

  return { command, positionals, flags }
}

/** Read a value flag, or undefined when absent. */
export function flagValue(
  args: ParsedArgs,
  name: string,
): string | undefined {
  const value = args.flags[name]
  return typeof value === 'string' ? value : undefined
}

/** Repeated value flags collapse to the last occurrence; split on commas. */
export function flagList(args: ParsedArgs, name: string): string[] | undefined {
  const value = flagValue(args, name)
  if (value === undefined) return undefined
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
}
