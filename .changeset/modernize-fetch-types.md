---
'surgejs-sdk': major
---

Modernize SDK: replace axios with native fetch (zero runtime deps), complete TypeScript types for all endpoints, add Vitest + MSW test suite, migrate build from TSDX to tsup, add Changesets release automation and GitHub Actions CI. Breaking: methods now return parsed data directly instead of axios response wrappers; new `SurgeApiError` thrown on failures.
