# surgejs-sdk

## 1.0.0

Complete rewrite as a modern TypeScript SDK.

- Namespaced async client covering the full documented Surge API (~45 endpoints): account, auth (incl. browser login + MFA sessions), scoped tokens, projects, revisions (rollback/rollfore/cutover/discard), metadata/manifest/status, cache purge, DNS + zone CRUD, collaborators, settings, analytics/usage/audit, billing with Stripe browser links
- Streaming publish (`client.publish`): gzipped USTAR tarball streamed to `PUT /:domain` with live NDJSON progress; upload dedupe ("carry") with stale-ticket retry; `.surgeignore` + Surge default rules; symlink resolution with cycle detection; single-HTML-file projects; preview (`stage`) deploys; collaborator add/remove and `ssl` during publish
- CLI-parity publish behavior: `force: 'http' | 'https'` and `private` folded into the `argv` header the way the CLI ships them; `timestamp` (auto) and `cmd` headers; pre-flight of the documented 10,100-file / 450 MB limits with opt-out
- `client.encrypt` / `client.ssl` for managed and custom certificates over the same NDJSON protocol
- `client.settings.update` with the full documented setting set including `private`; `null` clears a key
- Platform helpers for tool builders: `SURGE_DNS` (name servers, CNAME/A targets), `PROJECT_LIMITS`, `PUBLISH_RATE_LIMITS`, `limitViolation`, `previewUrl`, `isValidDomain`, and CNAME-file helpers (`readCname` / `writeCname`) matching the CLI's precedence and never-overwrite rules
- Typed error hierarchy (`SurgeAuthError`, `SurgePermissionError`, `SurgeNotFoundError`, `SurgeConflictError`, `SurgeValidationError`, `SurgeRateLimitError`, `SurgeNetworkError`) carrying server `messages`/`details`
- Streaming handle consumed as events, a `completed` promise, or an async iterable; stream types cover `cta`, `checkout_url`, compile-error frames
- Dual ESM/CJS build with declarations; Node ≥ 18.13; native fetch (axios removed)
- Fixes bugs in 0.x: `zoneAdd` used GET instead of POST; `dnsAdd`/`settings` sent a spurious `{ data }` body wrapper; `stats` required auth on a public endpoint
- Tooling: pnpm, tsdown, vitest (251 tests, ≥98% coverage on every metric incl. byte-level tar golden tests, NDJSON fault-injection, and a real-HTTP e2e), oxlint, publint, attw, changesets, GitHub Actions
