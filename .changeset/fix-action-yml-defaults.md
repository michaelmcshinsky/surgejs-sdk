---
"surgejs-sdk": patch
---

Fix the composite action's default SDK version range (`^1.1.0` resolved to
nothing on npm; now `^1.0.0`) and pin Node 22 via `actions/setup-node`
before the global CLI install, matching the package's `engines` floor.
Adds a regression test covering both constraints.
