#!/usr/bin/env node
/**
 * `surgejs` bin entry. All logic lives in `./run.ts` so tests can import it
 * without executing the CLI.
 */
import process from 'node:process'
import { main } from './run.js'

void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code
})
