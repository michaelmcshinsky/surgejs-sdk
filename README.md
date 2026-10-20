# surgejs-sdk

Typed TypeScript API client for [Surge.sh](https://surge.sh) public endpoints.

Zero runtime dependencies — built on native `fetch`.

## Install

```bash
npm install surgejs-sdk
```

Requires Node.js 18+ (or any runtime with `fetch` and `btoa`).

## Usage

```ts
import { Surge } from 'surgejs-sdk';

const surge = new Surge();

await surge.login('you@example.com', 'password');

const account = await surge.account();
const projects = await surge.list();

// DNS management
const records = await surge.getDnsRecords('myapp.surge.sh');
await surge.dnsAdd('myapp.surge.sh', { type: 'A', name: '@', value: '1.2.3.4' });
```

### Credentials

```ts
const surge = new Surge({ username: 'you@example.com', password: 'password' });
// or later
surge.init({ username: 'you@example.com', password: 'password' });
surge.logout();
```

### Error handling

All requests throw `SurgeApiError` on non-2xx responses:

```ts
import { Surge, SurgeApiError } from 'surgejs-sdk';

try {
  await surge.account();
} catch (error) {
  if (error instanceof SurgeApiError) {
    console.error(error.status, error.message, error.body);
  }
}
```

### Cancellation

Every method accepts an optional `RequestOptions` with an `AbortSignal`:

```ts
const controller = new AbortController();
surge.list({ signal: controller.signal });
controller.abort();
```

## API

| Method | Description |
| --- | --- |
| `login(username?, password?)` | Authenticate; returns `{ email, token }` |
| `logout()` | Clear stored credentials |
| `account()` | User account details |
| `stats()` | Usage statistics |
| `list()` | Live projects |
| `dns(domain)` / `dnsAdd` / `dnsRemove` | DNS record management |
| `getDnsRecords(domain)` | DNS records flattened to an array |
| `zone(domain)` / `zoneAdd` / `zoneRemove` | Zone record management |
| `certs(domain)` | TLS certificates |
| `settings(domain, data)` | Domain settings |
| `analytics(domain)` / `usage(domain)` | Traffic analytics |
| `audit(domain)` | Revision, manifest, and cert details |
| `deploy(domain, data, meta)` | Upload a site |
| `teardown(domain)` | Remove a site |
| `plans(domain?)` | Available plans |
| `inviteCollaborators` / `revokeCollaborators` | Collaborator management |
| `cacheBust(domain)` | Purge cache |

## Development

```bash
npm install
npm run test
npm run build
```

## Releasing

Releases are automated with [Changesets](https://github.com/changesets/changesets).
Merge a release PR from the `changeset` GitHub Action to publish to npm.

## License

MIT
