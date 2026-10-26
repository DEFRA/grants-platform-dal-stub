#!/usr/bin/env node
/**
 * Loads the fixture collections exactly as the server does and exits non-zero
 * if anything is wrong. All validation lives in src/data/store.js (synthetic
 * identifier ranges, file names, relationship integrity, and a scan for issued-
 * looking identifiers in any field); this script only gives CI a clearly named
 * check so a fixture problem is reported as such rather than as a failing test.
 */
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
  if (!(err instanceof DataStoreValidationError)) throw err
  console.error(err.message)
  process.exitCode = 1
}
