[![Surge Logo](https://raw.githubusercontent.com/michaelmcshinsky/surgejs-sdk/main/logo.png)](https://surge.sh)

# surgejs-sdk

[![npm version](https://img.shields.io/npm/v/surgejs-sdk?style=flat-square&logo=npm)](https://www.npmjs.com/package/surgejs-sdk)
[![npm downloads](https://img.shields.io/npm/dm/surgejs-sdk?style=flat-square&logo=npm)](https://www.npmjs.com/package/surgejs-sdk)
[![CI](https://img.shields.io/github/actions/workflow/status/michaelmcshinsky/surgejs-sdk/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/michaelmcshinsky/surgejs-sdk/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/badge/coverage-%E2%89%A598%25-brightgreen?style=flat-square&label=coverage)](https://github.com/michaelmcshinsky/surgejs-sdk/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.18-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

Modern TypeScript SDK for the [Surge.sh](https://surge.sh) static publishing platform — the complete HTTP API as namespaced, async, fully-typed resources, plus a streaming publisher with upload dedupe.

- **Full API surface** — accounts, tokens, projects, revisions, DNS/zone, collaborators, settings, analytics, billing (~45 endpoints)
- **Streaming publish** — gzipped USTAR tarball streamed to `PUT /:domain`, live NDJSON progress, upload dedupe ("carry"), symlinks, `.surgeignore`, single-file projects
- **Async/await first** — every JSON method returns a typed promise; streams are event emitters *and* promises *and* async iterables
- **Typed errors** — `SurgeAuthError`, `SurgeRateLimitError`, … carrying the server's `messages`/`details` and status
- **CLI and GitHub Action included** — `surgejs publish`, `list`, `teardown`, `whoami`, plus a composite action with typed inputs
- **Zero runtime deps** beyond `ignore` — native `fetch`, Node ≥ 22.18, dual ESM + CJS

```bash
npm install surgejs-sdk
```

## When to Use This Over the Surge CLI

| Scenario | CLI | **surgejs-sdk** |
|----------|-----|-----------------|
| One-off `surge ./dist site.com` | ✅ Simple | ⚠️ Overkill |
| Custom deploy logic (staging gates, multi-domain, rollback) | ❌ Shell + parsing | ✅ Typed, composable |
| CI/CD with scoped tokens & error handling | ⚠️ Exit-code checks | ✅ Typed errors, programmatic auth |
| Integrating Surge into a Node tool/dashboard | ❌ Child-process hacks | ✅ Native async/await |
| Progress bars, NDJSON parsing, upload dedupe control | ❌ Hard-coded | ✅ Events, async iteration |
| Managing DNS, collaborators, billing programmatically | ❌ Not covered | ✅ Full API surface |
| Embedding in serverless / edge functions | ❌ Spawning a CLI | ✅ Native `fetch`, zero deps |

**Rule of thumb:** CLI for humans deploying once; SDK for code that deploys repeatedly or needs control.

## Compared to the official Surge packages

Surge ships two packages that power its own CLI: [`surge-sdk`](https://www.npmjs.com/package/surge-sdk) (the HTTP API client) and [`surge-stream`](https://www.npmjs.com/package/surge-stream) (the tarball upload stream). Both are maintained by Surge's author and both are mature. If you want the lowest-risk dependency and do not need types or ESM, use them.

| | `surge-sdk` + `surge-stream` | **surgejs-sdk** |
|---|---|---|
| Published version | 0.34.0 | 1.x (stable) |
| Maintained by | Surge's author | community |
| TypeScript types | none shipped | first-class, strict |
| Module format | CommonJS only | dual ESM + CJS with declarations |
| Packages to install | 2 | 1 |
| Runtime dependencies | `split`, `ignore`, `surge-ignore`, … | `ignore` |
| Publish API | stream object, callbacks | events **and** promise **and** async iterable |
| Upload dedupe | internal to the stream | exposed as a `carry` frame you can observe |
| Errors | strings / generic `Error` | typed hierarchy with server `messages`/`details` |
| Node floor | ≥ 18.13 | ≥ 22.18 |
| Live installs (last month) | ~133k each | 171 |

**Choose the official packages when** you need the longest track record, you are on Node 18/20, or you are already deep in the CLI's internals.

**Choose surgejs-sdk when** you want types without `@types` guesswork, ESM, one dependency, a publish you can `await` or `for await`, or errors you can branch on.

Honest caveat: the official packages carry ~780× the install volume. They are the reference implementation; this one is the typed, modernized alternative.

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

## CLI

The package ships a small CLI for the flows that do not need code. It is deliberately thin: publish, list, teardown, whoami.

```bash
npx surgejs-sdk publish ./dist my-site.surge.sh
npx surgejs-sdk publish ./dist my-site.surge.sh --message "release 2.4.0"
npx surgejs-sdk publish ./dist my-site.surge.sh --stage qa --private
npx surgejs-sdk list
npx surgejs-sdk teardown old-site.surge.sh --yes
```

| Command | Does |
|---|---|
| `publish [path] <domain>` | Streams a deploy, prints the live URLs |
| `list` | Every project on the account, aligned columns |
| `teardown <domain> --yes` | Removes the project and all revisions |
| `whoami` | Account email, plan, verification state |

Global flags: `--token <token>` (defaults to `$SURGE_TOKEN`), `--endpoint <url>`, `--help`, `--version`.

Design notes:

- stdout carries results only; progress, messages, and server CTAs go to stderr, so `urls=$(surgejs publish ...)` stays clean in scripts.
- Unknown flags fail with exit code 2 instead of being ignored, because the next thing that happens is a production deploy.
- `teardown` refuses to run without `--yes`.
- Anything beyond these four commands belongs in the client, where it can be typed and awaited.

## GitHub Action

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - uses: michaelmcshinsky/surgejs-sdk@v1
        id: surge
        with:
          domain: my-site.surge.sh
          token: ${{ secrets.SURGE_TOKEN }}
          path: ./dist
          message: "deploy ${{ github.sha }}"
      - run: echo "Live at ${{ steps.surge.outputs.urls }}"
```

Inputs: `domain` and `token` (required); `path`, `message`, `stage`, `force`, `private`, `version`. Output: `urls` as a JSON array.

The action installs `surgejs-sdk` from npm and shells out to the CLI, so it needs no build step of its own.

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

## CI Usage

### GitHub Actions

```yaml
name: Deploy to Surge
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Deploy to Surge
        run: |
          cat > deploy.mjs << 'EOF'
          import { createClient } from 'surgejs-sdk'
          const client = createClient()
          const info = await client.publish('./dist', process.env.SURGE_DOMAIN, {
            message: `ci deploy — ${process.env.GITHUB_SHA}`,
            force: 'https',
          })
          console.log(`Live at ${info.urls[0]}`)
          EOF
          node deploy.mjs
        env:
          SURGE_TOKEN: ${{ secrets.SURGE_TOKEN }}
          SURGE_DOMAIN: ${{ vars.SURGE_DOMAIN }}
```

### GitLab CI

```yaml
deploy:surge:
  stage: deploy
  image: node:22
  script:
    - npm ci
    - npm run build
    - |
      node -e "
        import('surgejs-sdk').then(async ({ createClient }) => {
          const client = createClient()
          const info = await client.publish('./dist', '$SURGE_DOMAIN', {
            message: 'gitlab-ci deploy',
          })
          console.log('Live at', info.urls[0])
        })
      "
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  variables:
    SURGE_DOMAIN: your-site.surge.sh
```

### CircleCI

```yaml
version: 2.1
jobs:
  deploy:
    docker:
      - image: cimg/node:22.18
    steps:
      - checkout
      - restore_cache:
          keys: [deps-{{ checksum "package-lock.json" }}]
      - run: npm ci
      - save_cache:
          key: deps-{{ checksum "package-lock.json" }}
          paths: [node_modules]
      - run: npm run build
      - run: |
          cat > deploy.mjs << 'EOF'
          import { createClient } from 'surgejs-sdk'
          const client = createClient()
          const info = await client.publish('./dist', process.env.SURGE_DOMAIN, {
            message: 'circleci deploy',
          })
          console.log(`Live at ${info.urls[0]}`)
          EOF
          node deploy.mjs
        environment:
          SURGE_DOMAIN: your-site.surge.sh
workflows:
  deploy:
    jobs:
      - deploy:
          filters:
            branches:
              only: main
```

### Minting a Scoped CI Token

Never use your main Surge password in CI. Mint a scoped, labeled token:

```bash
# CLI — creates a token that can only publish to one domain
surge tokens add --domain example.com -m "github-actions-ci"
# → prints SURGE_TOKEN value; store as a CI secret
```

Scoped tokens limit blast radius if a CI secret leaks.

## Tutorial: Building a Custom Surge Deployer

This walks through a production-grade deploy script that handles staging gates, multi-domain rollback, and structured logging.

### Step 1 — Install and Configure

```bash
npm install surgejs-sdk
```

```ts
// deploy.ts
import { createClient, SurgePermissionError, SurgeRateLimitError } from 'surgejs-sdk'

const client = createClient({
  token: process.env.SURGE_TOKEN,
  onStatus: {
    429: (err) => console.warn(`Rate limited: ${err.message}`),
  },
})
```

### Step 2 — Staging Preview Before Production

```ts
async function deployWithStagingGate(buildDir: string, prodDomain: string) {
  // 1. Publish a staging preview first
  const stagingDomain = `${prodDomain.replace('.com', '')}-preview.surge.sh`
  const staging = await client.publish(buildDir, stagingDomain, {
    message: 'staging preview',
    stage: true,
  })
  console.log(`Staging: ${staging.urls[0]}`)

  // 2. Run smoke tests against the staging URL
  const passed = await runSmokeTests(staging.urls[0]!)
  if (!passed) {
    console.error('Smoke tests failed — aborting production deploy')
    process.exit(1)
  }

  // 3. Promote to production
  const prod = await client.publish(buildDir, prodDomain, {
    message: 'promoted to production',
    force: 'https',
  })
  console.log(`Production: ${prod.urls[0]}`)
}
```

### Step 3 — Multi-Domain Deploy with Rollback Safety

```ts
async function deployMultiDomain(buildDir: string, domains: string[]) {
  const results = await Promise.allSettled(
    domains.map(async (domain) => {
      // Record current revision before deploying
      const revisions = await client.projects.revisions(domain)
      const currentRev = revisions[0]?.rev

      try {
        const info = await client.publish(buildDir, domain, { message: 'multi-domain deploy' })
        return { domain, rev: info.rev, previousRev: currentRev }
      } catch (err) {
        // Rollback the successful ones if this one fails
        if (currentRev) {
          await client.projects.rollback(domain)
          console.warn(`Rolled back ${domain} to ${currentRev}`)
        }
        throw err
      }
    })
  )

  const failed = results.filter((r) => r.status === 'rejected')
  if (failed.length > 0) {
    console.error(`${failed.length}/${domains.length} domains failed`)
    process.exit(1)
  }
}
```

### Step 4 — Rate Limit Handling & Retries

```ts
async function publishWithRetry(
  buildDir: string,
  domain: string,
  maxRetries = 3,
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.publish(buildDir, domain).completed
    } catch (err) {
      if (err instanceof SurgeRateLimitError) {
        const waitMs = Math.min(2 ** attempt * 1000, 30_000)
        console.warn(`Rate limited, waiting ${waitMs}ms (attempt ${attempt})`)
        await new Promise((r) => setTimeout(r, waitMs))
        continue
      }
      throw err
    }
  }
  throw new Error(`Failed after ${maxRetries} attempts`)
}
```

### Step 5 — Put It Together

```ts
async function main() {
  const buildDir = './dist'
  const domain = process.env.SURGE_DOMAIN!

  try {
    const info = await publishWithRetry(buildDir, domain)
    console.log(`✅ Deployed: ${info.urls.join(', ')}`)
  } catch (err) {
    if (err instanceof SurgePermissionError) {
      console.error('Permission denied — check SURGE_TOKEN scope:', err.messages)
    } else {
      console.error('Deploy failed:', err)
    }
    process.exit(1)
  }
}

main()
```

**Key takeaways:**
- Use `Promise.allSettled` for multi-domain deploys so one failure doesn't hide others
- Record revisions before deploying for safe rollback
- `SurgeRateLimitError` is typed — handle it explicitly, don't catch-all
- Scope tokens per domain (`surge tokens add --domain`) for CI safety

## Requirements

- Node.js ≥ 22.18 (native `fetch`; both 18 and 20 are past end-of-life)
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

---

Built by [Michael McShinsky](https://mcshinsky.net). The rewrite rationale and architecture decisions are written up at [mcshinsky.net/work](https://mcshinsky.net/work/).
