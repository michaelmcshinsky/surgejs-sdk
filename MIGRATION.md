# Migrating from surgejs-sdk 0.x to 1.0

Version 1.0 is a complete rewrite: modern tooling, the full Surge API surface, streaming publish, and end-to-end types. There is no compatibility layer — the old surface was small enough that a table is clearer than shims.

## At a glance

| 0.x | 1.0 |
|---|---|
| `new Surge({ username, password })` | `createClient({ email, password })` or `createClient({ token })` |
| `surge.login()` → axios response | `client.auth.login(email, password)` → `{ email, token, credentials }` |
| `surge.logout()` (no-op) | dropped — clear your own token store; revoke via `client.tokens.remove(id)` |
| `surge.account()` → axios response | `client.account.get()` → `Account` (data directly, no axios envelope) |
| `surge.stats()` | `client.stats()` (public; no auth needed) |
| `surge.cancel()` | `client.account.nuke()` |
| `surge.list()` | `client.projects.list()` |
| `surge.deploy()` (unimplemented) | `client.publish(path, domain, opts)` — full streaming publish |
| `surge.teardown(d)` | `client.projects.teardown(d)` |
| `surge.inviteCollaborators(d, data)` | `client.collaborators.invite(d, emails[])` |
| `surge.revokeCollaborators(d, emails)` | `client.collaborators.revoke(d, emails[])` |
| `surge.cacheBust(d)` | `client.projects.bust(d)` |
| `surge.certs(d)` | `client.projects.certs(d)` |
| `surge.dns(d)` / `dnsAdd` / `dnsRemove` | `client.dns.list(d)` / `add(d, record)` / `remove(d, id)` |
| `surge.zone(d)` / `zoneAdd` / `zoneRemove` | `client.zone.list(d)` / `add(d, record)` / `remove(d, id)` |
| `surge.settings(d, data)` | `client.settings.update(d, props)` |
| `surge.analytics(d)` / `usage` / `audit` | `client.analytics.get(d)` / `usage(d)` / `audit(d)` |
| `surge.plans(d)` | `client.billing.plans(d?)` |
| `surge.resetPassword(email)` | `client.auth.resetPassword(email)` |

## Behavioral changes

- **No axios.** Methods return parsed data directly (`Account`, not `{ data: Account }`). The transport is the native `fetch`.
- **No credentials in the constructor for daily use.** Pass a token (`createClient({ token })` or `SURGE_TOKEN`); email+password only mint tokens via `auth.login`.
- **Errors are typed.** 401/403/404/409/400/422/429/5xx throw `SurgeAuthError`-family classes carrying `status`, `messages`, `details`.
- **Bugs fixed** (present in 0.x):
  - `zoneAdd` used `GET` instead of `POST`.
  - `dnsAdd` and `settings` wrapped request bodies in a spurious `{ data: … }` envelope the server never understood.
  - `stats` required credentials; `/stats` is public.
  - Types were unexported interfaces with `any` holes; 1.x types are exported, exhaustive, and match the live API.

## New in 1.0

- Streaming publish with progress events, upload dedupe, preview (`stage`) deploys, collaborator add/remove during publish, `force`/`private` publish flags (argv-header parity with the CLI), auto `timestamp` + `cmd` headers, and pre-flight of the documented project limits
- Revisions: `revisions`, `rollback`, `rollfore`, `cutover`, `discard`
- Tokens: `list`, `add` (scoped), `remove`; browser login sessions; MFA sessions
- `metadata`, `manifest`, `status`, `usage`, `audit`, cache purge
- Billing: `setPlan`, `setCard`, `subscription`, Stripe `upgradeLink` / `billingLink`
- Project settings including `private` (require sign-in for the whole domain)
- Platform helpers: `SURGE_DNS`, `PROJECT_LIMITS`, `PUBLISH_RATE_LIMITS`, `limitViolation`, `previewUrl`, `isValidDomain`, `readCname`/`writeCname`
- `withCredentials()` for multi-account tools
- Dual ESM/CJS builds, Node ≥ 18.13, zero config

## Runtime requirements

0.x claimed `node >= 10`. 1.x requires **Node ≥ 18.13** (native fetch), matching the official Surge CLI/SDK.
