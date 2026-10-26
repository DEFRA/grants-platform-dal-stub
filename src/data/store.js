import fs from 'node:fs/promises'
import path from 'node:path'

import { isSyntheticCrn, isSyntheticSbi } from './synthetic-ranges.js'

const COLLECTIONS = {
  businesses: 'businesses',
  customers: 'customers',
  relationships: 'relationships'
}

// Fields that legitimately hold long digit strings that are not identifiers.
const IGNORED_DIGIT_FIELDS = new Set([
  'uprn',
  'mobile',
  'landline',
  'reference',
  'frn'
])

/**
 * In-memory copy of the fixture collections. Every file is validated on load:
 * identifiers must be synthetic, file names must match their content, every
 * relationship must point at an existing business and customer, and no field
 * anywhere may hold a 9- or 10-digit value that looks like an issued SBI or
 * CRN. A single bad file fails startup and `npm test`, which is the guardrail
 * that keeps every fixture synthetic.
 */
export class DataStore {
  #businesses = new Map()
  #customers = new Map()
  #relationships = new Map()
  #relationshipsBySbi = new Map()
  #relationshipsByCrn = new Map()

  static async load(dataPath) {
    const store = new DataStore()
    const problems = []

    const businesses = await readCollection(
      path.join(dataPath, COLLECTIONS.businesses),
      problems
    )
    for (const { name, doc } of businesses) {
      problems.push(
        ...realLookingIdentifiers(doc).map((p) => `businesses/${name}: ${p}`)
      )
      const sbi = String(doc.sbi ?? '')
      if (!isSyntheticSbi(sbi)) {
        problems.push(
          `businesses/${name}: sbi "${sbi}" is outside the synthetic ranges`
        )
      } else if (name !== `${sbi}.json`) {
        problems.push(
          `businesses/${name}: file name does not match sbi "${sbi}"`
        )
      } else {
        store.#businesses.set(sbi, { ...doc, sbi })
      }
    }

    const customers = await readCollection(
      path.join(dataPath, COLLECTIONS.customers),
      problems
    )
    for (const { name, doc } of customers) {
      problems.push(
        ...realLookingIdentifiers(doc).map((p) => `customers/${name}: ${p}`)
      )
      const crn = String(doc.crn ?? '')
      if (!isSyntheticCrn(crn)) {
        problems.push(
          `customers/${name}: crn "${crn}" is outside the synthetic ranges`
        )
      } else if (name !== `${crn}.json`) {
        problems.push(
          `customers/${name}: file name does not match crn "${crn}"`
        )
      } else {
        store.#customers.set(crn, { ...doc, crn })
      }
    }

    const relationships = await readCollection(
      path.join(dataPath, COLLECTIONS.relationships),
      problems
    )
    for (const { name, doc } of relationships) {
      const sbi = String(doc.sbi ?? '')
      const crn = String(doc.crn ?? '')
      const key = relationshipKey(sbi, crn)
      const fileProblems = []
      if (name !== `${key}.json`) {
        fileProblems.push(`file name does not match "${key}"`)
      }
      if (!store.#businesses.has(sbi)) {
        fileProblems.push(`no business fixture for sbi "${sbi}"`)
      }
      if (!store.#customers.has(crn)) {
        fileProblems.push(`no customer fixture for crn "${crn}"`)
      }
      if (!Array.isArray(doc.permissionGroups)) {
        fileProblems.push('permissionGroups must be an array')
      }
      if (fileProblems.length > 0) {
        problems.push(
          ...fileProblems.map((problem) => `relationships/${name}: ${problem}`)
        )
        continue
      }
      const relationship = { ...doc, sbi, crn }
      store.#relationships.set(key, relationship)
      pushTo(store.#relationshipsBySbi, sbi, relationship)
      pushTo(store.#relationshipsByCrn, crn, relationship)
    }

    if (problems.length > 0) {
      throw new DataStoreValidationError(problems)
    }

    return store
  }

  get counts() {
    return {
      businesses: this.#businesses.size,
      customers: this.#customers.size,
      relationships: this.#relationships.size
    }
  }

  getBusiness(sbi) {
    return this.#businesses.get(String(sbi)) ?? null
  }

  getCustomer(crn) {
    return this.#customers.get(String(crn)) ?? null
  }

  getRelationship(sbi, crn) {
    return this.#relationships.get(relationshipKey(sbi, crn)) ?? null
  }

  getRelationshipsForBusiness(sbi) {
    return this.#relationshipsBySbi.get(String(sbi)) ?? []
  }

  getRelationshipsForCustomer(crn) {
    return this.#relationshipsByCrn.get(String(crn)) ?? []
  }

  listBusinesses() {
    return [...this.#businesses.values()]
  }

  listCustomers() {
    return [...this.#customers.values()]
  }

  listRelationships() {
    return [...this.#relationships.values()]
  }
}

export class DataStoreValidationError extends Error {
  constructor(problems) {
    super(`Fixture validation failed:\n  - ${problems.join('\n  - ')}`)
    this.name = 'DataStoreValidationError'
    this.problems = problems
  }
}

export function relationshipKey(sbi, crn) {
  return `${sbi}-${crn}`
}

async function readCollection(dir, problems) {
  let names
  try {
    names = await fs.readdir(dir)
  } catch (err) {
    if (err.code === 'ENOENT') {
      problems.push(`missing collection directory ${dir}`)
      return []
    }
    throw err
  }

  const docs = []
  for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
    try {
      const doc = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'))
      docs.push({ name, doc })
    } catch (err) {
      problems.push(`${path.basename(dir)}/${name}: ${err.message}`)
    }
  }
  return docs
}

/**
 * Walks a fixture and reports any run of 9 or 10 digits outside the synthetic
 * ranges, wherever it sits (including inside longer text), so a stray
 * identifier in a name or address line is caught as well as one in an `sbi`
 * or `crn` field.
 */
function realLookingIdentifiers(value, keyPath = []) {
  if (value === null || value === undefined) {
    return []
  }
  if (typeof value === 'string' || typeof value === 'number') {
    if (IGNORED_DIGIT_FIELDS.has(keyPath.at(-1))) {
      return []
    }
    const problems = []
    for (const [digits] of String(value).matchAll(/(?<!\d)\d{9,10}(?!\d)/g)) {
      if (digits.length === 10 && !isSyntheticCrn(digits)) {
        problems.push(
          `${keyPath.join('.')} contains ${digits}, which looks like an issued CRN`
        )
      }
      if (digits.length === 9 && !isSyntheticSbi(digits)) {
        problems.push(
          `${keyPath.join('.')} contains ${digits}, which looks like an issued SBI`
        )
      }
    }
    return problems
  }
  if (typeof value !== 'object') {
    return []
  }
  return Object.entries(value).flatMap(([key, item]) =>
    realLookingIdentifiers(item, [...keyPath, key])
  )
}

function pushTo(map, key, value) {
  const list = map.get(key)
  if (list) {
    list.push(value)
  } else {
    map.set(key, [value])
  }
}
