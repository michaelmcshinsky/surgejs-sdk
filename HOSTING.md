# Hosting & running — surgejs-sdk

Central plan: `D:\Projects\HOSTING.md`. Implementation status: `D:\Projects\HOSTING-STATUS.md`.

TypeScript SDK for Surge.sh.

## Parts

| Part | Path / service | Role |
|---|---|---|
| Library | `.` | TypeScript package |

## Run locally

Package manager: **pnpm (lockfile detected)**. Node: see `.nvmrc` / `engines` if present.

```bash
pnpm install
```

### Root commands

| Task | Command |
|---|---|
| dev | `pnpm dev` |
| build | `pnpm build` |
| test | `pnpm test` |
| typecheck | `pnpm typecheck` |
| lint | `pnpm lint` |


## Hosting

| Part | Host | How |
|---|---|---|
| Package | npm | Publish from the repo |

### Deploy / provision

- `pnpm build` then `npm publish` (or `pnpm release`).

## Verify

```bash
pnpm typecheck
pnpm test
pnpm check
```

---

See also: `D:\Projects\HOSTING.md` (portfolio plan), `D:\Projects\RUNBOOK.md` (operations), `D:\Projects\HOSTING-STATUS.md` (what is verified).
