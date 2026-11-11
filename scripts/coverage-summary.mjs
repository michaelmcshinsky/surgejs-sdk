#!/usr/bin/env node
/**
 * Write the vitest coverage summary into the GitHub Actions job summary.
 *
 * Runs after `pnpm test:coverage`, which emits `coverage/coverage-summary.json`
 * (the `json-summary` reporter). Kept as a file rather than an inline
 * `node -e` so quoting cannot break it across shells.
 */
import { readFileSync, appendFileSync } from 'node:fs'

const METRICS = ['lines', 'statements', 'functions', 'branches']

let summary
try {
  summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'))
} catch (error) {
  console.error('coverage-summary.json is missing; did test:coverage run?')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const total = summary.total
if (!total) {
  console.error('coverage-summary.json has no `total` entry')
  process.exit(1)
}

const rows = METRICS.map((metric) => {
  const value = total[metric]
  return `| ${metric} | ${value?.pct ?? 'n/a'}% |`
})

const table = ['| Metric | Coverage |', '| --- | --- |', ...rows].join('\n')
const out = `${table}\n`

process.stdout.write(`${out}\n`)

const target = process.env.GITHUB_STEP_SUMMARY
if (target) appendFileSync(target, out)
