#!/usr/bin/env node
// Loads the fixtures exactly as the server does and exits non-zero on any problem,
// so CI reports a bad fixture under its own name rather than as a failing test.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DataStore, DataStoreValidationError } from '../src/data/store.js'

const dataPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data'
)

try {
  const { businesses, customers, relationships } = (
    await DataStore.load(dataPath)
  ).counts
  console.log(
    `Fixtures OK: ${businesses} businesses, ${customers} customers, ${relationships} relationships, all identifiers synthetic`
  )
} catch (err) {
  if (!(err instanceof DataStoreValidationError)) {
    throw err
  }
  console.error(err.message)
  process.exitCode = 1
}
