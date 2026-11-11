---
"surgejs-sdk": minor
---

Add a bundled `surgejs` CLI and a composite GitHub Action.

- `surgejs publish [path] <domain>` streams a deploy and prints the resulting
  URLs on stdout, with progress and server messages on stderr so command
  substitution stays clean. Supports `--message`, `--stage`, `--force`,
  `--private`, `--add`, and `--rem`.
- `surgejs list`, `surgejs teardown <domain> --yes`, and `surgejs whoami`
  cover the remaining everyday flows.
- New `action.yml` so a workflow can `uses: michaelmcshinsky/surgejs-sdk@v1`
  with `domain` and `token` inputs and read `outputs.urls`.
- Unknown flags now fail with exit code 2 rather than being ignored.
