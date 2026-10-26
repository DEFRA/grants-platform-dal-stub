import fs from 'node:fs/promises'
import path from 'node:path'

import permissionGroupsReference from './static/permission-groups.json' with { type: 'json' }

import {
  isSyntheticCrn,
  isSyntheticEmail,
  isSyntheticFrn,
  isSyntheticLandline,
  isSyntheticMobile,
  isSyntheticPostcode,
  isSyntheticSbi
} from './synthetic-ranges.js'

const COLLECTIONS = {
  businesses: 'businesses',
  customers: 'customers',
  relationships: 'relationships'
}

const PERMISSION_LEVELS = new Map(
  permissionGroupsReference.map((group) => [
    group.id,
    new Set(group.permissions.map((permission) => permission.level))
  ])
)

// Fixtures loaded into memory. Anything outside the synthetic conventions
// (see synthetic-ranges.js) fails the load, and so startup, tests and CI.
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
        ...fixtureValueProblems(doc).map((p) => `businesses/${name}: ${p}`)
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
        ...fixtureValueProblems(doc).map((p) => `customers/${name}: ${p}`)
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
      const fileProblems = fixtureValueProblems(doc)
      if (name !== `${key}.json`) {
        fileProblems.push(`file name does not match "${key}"`)
      }
      if (!store.#businesses.has(sbi)) {
        fileProblems.push(`no business fixture for sbi "${sbi}"`)
      }
      if (!store.#customers.has(crn)) {
        fileProblems.push(`no customer fixture for crn "${crn}"`)
      }
      fileProblems.push(...permissionGroupProblems(doc.permissionGroups))
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

// Any 9/10-digit run outside the synthetic ranges, and any postcode, phone
// number or email outside the synthetic conventions, anywhere in the document.
function fixtureValueProblems(value, keyPath = []) {
  if (value === null || value === undefined) {
    return []
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value)
    const key = keyPath.at(-1)
    const where = keyPath.join('.')
    const problems = []
    if (key === 'postalCode' && !isSyntheticPostcode(text)) {
      problems.push(`${where} "${text}" is not a synthetic (ZZ99 9ZZ) postcode`)
    }
    if (key === 'mobile' && !isSyntheticMobile(text)) {
      problems.push(`${where} "${text}" is not in the 07700 900NNN range`)
    }
    if (key === 'landline' && !isSyntheticLandline(text)) {
      problems.push(`${where} "${text}" is not in the 01632 960NNN range`)
    }
    if (text.includes('@') && !isSyntheticEmail(text)) {
      problems.push(`${where} "${text}" is not an example.test email address`)
    }
    for (const [digits] of text.matchAll(/(?<!\d)\d{9,10}(?!\d)/g)) {
      if (
        digits.length === 10 &&
        !isSyntheticCrn(digits) &&
        !isSyntheticFrn(digits)
      ) {
        problems.push(
          `${where} contains ${digits}, which looks like an issued CRN or FRN`
        )
      }
      if (digits.length === 9 && !isSyntheticSbi(digits)) {
        problems.push(
          `${where} contains ${digits}, which looks like an issued SBI`
        )
      }
    }
    return problems
  }
  if (typeof value !== 'object') {
    return []
  }
  return Object.entries(value).flatMap(([key, item]) =>
    fixtureValueProblems(item, [...keyPath, key])
  )
}

function permissionGroupProblems(groups) {
  if (!Array.isArray(groups)) {
    return ['permissionGroups must be an array']
  }
  const seen = new Set()
  return groups.flatMap((group, index) => {
    const where = `permissionGroups[${index}]`
    const levels = PERMISSION_LEVELS.get(group?.id)
    if (!levels) {
      return [`${where}.id "${group?.id}" is not a permission group id`]
    }
    const problems = []
    if (!levels.has(group.level)) {
      problems.push(
        `${where}.level "${group.level}" is not a level of ${group.id}`
      )
    }
    if (group.functions !== undefined && !Array.isArray(group.functions)) {
      problems.push(`${where}.functions must be an array`)
    }
    if (seen.has(group.id)) {
      problems.push(`${where}.id "${group.id}" appears more than once`)
    }
    seen.add(group.id)
    return problems
  })
}

function pushTo(map, key, value) {
  const list = map.get(key)
  if (list) {
    list.push(value)
  } else {
    map.set(key, [value])
  }
}
