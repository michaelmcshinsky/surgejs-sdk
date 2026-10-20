[![Surge Logo](https://raw.githubusercontent.com/michaelmcshinsky/surgejs-sdk/main/logo.png)](https://surge.sh)

# surgejs-sdk

Modern TypeScript SDK for the [Surge.sh](https://surge.sh) static publishing platform — the complete HTTP API as namespaced, async, fully-typed resources, plus a streaming publisher with upload dedupe.

- **Full API surface** — accounts, tokens, projects, revisions, DNS/zone, collaborators, settings, analytics, billing (~45 endpoints)
- **Streaming publish** — gzipped USTAR tarball streamed to `PUT /:domain`, live NDJSON progress, upload dedupe (“carry”), symlinks, `.surgeignore`, single-file projects
- **Async/await first** — every JSON method returns a typed promise; streams are event emitters *and* promises *and* async iterables
- **Typed errors** — `SurgeAuthError`, `SurgeRateLimitError`, … carrying the server’s `messages`/`details` and status
- **Zero runtime deps** beyond `ignore` — native `fetch`, Node ≥ 18.13, dual ESM + CJS

```
npm install surgejs-sdk
```

## Quick start

```ts
import { createClient } from 'surgejs-sdk'

// token from SURGE_TOKEN env, or pass one explicitly
const client = createClient({ token: process.env.SURGE_TOKEN })

// list projects
const projects = await client.projects.list()

// publish a directory
const handle = client.publish('./dist', 'my-site.surge.sh', {
  message: 'ship it',
})
handle.on('progress', (p) => process.stderr.write('.'))
const info = await handle.completed
console.log(`Live at ${info.urls[0]}`)
```

Need a token? Mint one anywhere you’re logged in (`surge tokens add`), or exchange email + password:

```ts
const { token } = await client.auth.login('you@example.com', 'password')
```

Signing in with an unknown email **creates the account** — same behavior as the CLI.

## The client

```ts
import { createClient } from 'surgejs-sdk'

const client = createClient({
  endpoint: 'https://surge.surge.sh', // default; also SURGE_ENDPOINT
  token: '…',                         // also SURGE_TOKEN
  // or email + password (only used by auth.login / mintToken)
  timeout: 30_000,                    // JSON request timeout, ms
  onStatus: {                         // optional cross-cutting handlers
    403(err) { console.error('Forbidden:', err.message) },
  },
})
```

Credentials resolve per call: explicit `withCredentials(…)` clone → client config → `SURGE_TOKEN` env.

```ts
const other = client.withCredentials('another-token') // original untouched
```

## API surface

Every method maps 1:1 to a documented Surge endpoint ([API reference](https://surge.sh/docs/api/reference)).

| Namespace | Methods |
|---|---|
| `client.account` | `get` · `verify` · `nuke` |
| `client.auth` | `login` · `mintToken` · `resetPassword` · `createLoginSession` · `pollLoginSession` · `createMfaSession` |
| `client.tokens` | `list` · `add` · `remove` |
| `client.projects` | `list` · `revisions` · `teardown` · `rollback` · `rollfore` · `cutover` · `discard` · `bust` · `metadata` · `manifest` · `status` · `certs` |
| `client.dns` | `list` · `add` · `remove` |
| `client.zone` | `list` · `add` · `remove` |
| `client.collaborators` | `invite` · `revoke` |
| `client.settings` | `update` (incl. `private`, clear with `null`) |
| `client.analytics` | `get` · `usage` · `audit` |
| `client.billing` | `plans` · `setPlan` · `setCard` · `subscription` · `upgradeLink` · `billingLink` |
| top-level | `stats` · `publish` · `encrypt` · `ssl` |

```ts
// revisions & rollback
const revs = await client.projects.revisions('example.com')
await client.projects.rollback('example.com')
await client.projects.cutover('example.com', revs[1]!.rev)

// DNS on an apex delegated to Surge's name servers
await client.dns.add('example.com', {
  type: 'MX', name: '@', value: 'mail.example.com', priority: 10,
})

// platform config — force HTTPS, lock the domain, redirects, CORS, HSTS…
// pass null on a key to clear it; {} echoes the current config
await client.settings.update('example.com', { force: 'https' })
await client.settings.update('example.com', { private: true })

// collaborators
await client.collaborators.invite('example.com', ['teammate@example.com'])

// analytics (last 14 days)
const stats = await client.analytics.get('example.com')

// billing via Stripe browser links (card data never touches the SDK)
const { url } = await client.billing.upgradeLink()
```

## Publishing

`client.publish(projectPath, domain, options)` packs the directory (Surge’s default ignore rules + your `.surgeignore`, symlinks resolved, single HTML files published as `index.html`) and streams it to the API. Projects are pre-flighted against the documented limits (10,100 files / 450 MB — opt out with `validateLimits: false`). For projects ≥ 1 MB it first asks the server which files it already has (`POST /:domain/carry`) and uploads only the missing ones with a dedupe ticket; a stale ticket retries the full upload once.

```ts
const handle = client.publish('./dist', 'example.com', {
  message: 'ci deploy',
  stage: true,              // preview only — production untouched
  force: 'https',           // remembered as platform config (like --force https)
  private: true,            // publish and lock the domain in one move
  add: ['new@example.com'],
  cmd: 'my-deployer',       // tool name, mirroring the CLI's `cmd` header
})
```

Three ways to consume the handle:

```ts
const handle = client.publish('./dist', 'example.com', {
  message: 'ci deploy',
  stage: true,          // preview only — production untouched
  add: ['new@example.com'],
  ssl: true,
})

// 1. events (official-SDK familiar)
handle.on('progress', (p) => drawBar(p.written, p.total))
handle.on('info', (info) => console.log(info.urls))
handle.on('success', (info) => console.log('live'))
handle.on('fail', (err) => console.error(err))
handle.on('unauthorized', (reason) => …) // 401
handle.on('forbidden', (reason) => …)    // 403 (rate limit, perms, size)
handle.on('ratelimited', (reason) => …)  // 429
handle.on('collect', (c) => openCheckout(c.stripe_pk)) // payment required

// 2. promise
const info = await handle.completed        // DeployInfo, or throws typed error

// 3. async iteration
for await (const event of handle) {
  if (event.type === 'progress') draw(event)
}
```

Certificates:

```ts
await client.encrypt('example.com').completed          // managed Let's Encrypt
await client.ssl('./cert.pem', 'example.com').completed // custom PEM (paid plans)
```

Low-level pieces (tar writer, project scanner, NDJSON handshake) are exported for custom tooling:

```ts
import { tarHeader, createProject, handshake } from 'surgejs-sdk/stream'
```

## Platform helpers

Constants and small utilities for tools that provision DNS, validate projects, or resolve targets the way the CLI does:

```ts
import {
  SURGE_DNS,           // { nameServers: [ns1–4.surge.world], cname: 'geo.surge.world', a: '…' }
  PROJECT_LIMITS,      // { maxFiles: 10_100, maxBytes: 450_000_000 }
  PUBLISH_RATE_LIMITS, // { perDomain: 30, perAccount: 60, perIp: 240, windowMinutes: 15 }
  limitViolation,      // (fileCount, bytes) => refusal message | null
  previewUrl,          // (rev, domain) => '1719…-example.surge.sh'
  isValidDomain,       // syntax check, mirroring the CLI's domain targets
  readCname,           // dir => { domain, source: 'cname' | 'package.json' } | null
  writeCname,          // dir, domain — writes once, never overwrites (CLI parity)
} from 'surgejs-sdk'
```

`readCname` uses the CLI’s precedence (`CNAME` file wins, then `package.json`’s `surge.domain`) — inside a project directory, that’s how every CLI command finds its target.

## Errors

Every failure is a `SurgeError` subclass with `status`, `messages[]`, and the server’s `details`:

```ts
import {
  SurgeAuthError,        // 401 — token expired/revoked
  SurgePermissionError,  // 403 — not a collaborator, rate limited, too large
  SurgeNotFoundError,    // 404
  SurgeConflictError,    // 409
  SurgeValidationError,  // 400/422 — invalid domain or record
  SurgeRateLimitError,   // 429
  SurgeNetworkError,     // transport — carries .cause with ECONNREFUSED etc.
} from 'surgejs-sdk'

try {
  await client.projects.teardown('example.com')
} catch (err) {
  if (err instanceof SurgePermissionError) {
    console.error(err.messages.join('\n')) // server's reason
  }
}
```

## CI usage

```yaml
- run: npm ci && npm run build
- run: npx surgejs-cli ./dist example.com   # or use this SDK directly
  env:
    SURGE_TOKEN: ${{ secrets.SURGE_TOKEN }}
```

```ts
// in a deploy script
const client = createClient() // reads SURGE_TOKEN
await client.publish('./dist', process.env['DOMAIN']!).completed
```

Mint scoped, labeled tokens with the CLI (`surge tokens add --domain example.com -m ci`) so a leaked CI secret can publish to one domain only.

## Requirements

- Node.js ≥ 18.13 (native `fetch`)
- TypeScript ≥ 5.0 recommended for consumers (types use modern syntax)

## Migrating from 0.x

See [MIGRATION.md](./MIGRATION.md) — the 0.x axios/callback API was replaced wholesale.

## Development

```
pnpm install
pnpm check   # typecheck + lint + test + build + publint + attw
```

## License

MIT © Michael McShinsky
