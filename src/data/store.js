import fs from 'node:fs/promises'
import path from 'node:path'

import permissionGroupsReference from './static/permission-groups.json' with { type: 'json' }

import {
  isSyntheticBusinessName,
  isSyntheticCrn,
  isSyntheticEmail,
  isSyntheticFrn,
  isSyntheticLandline,
  isSyntheticMobile,
  isSyntheticPostcode,
  isSyntheticSbi,
  isSyntheticSurname
} from './synthetic-ranges.js'

const COLLECTIONS = {
  businesses: 'businesses',
  customers: 'customers',
  relationships: 'relationships'
}

const SBI_LENGTH = 9
const CRN_LENGTH = 10
const IDENTIFIER_RUN = /(?<!\d)\d{9,10}(?!\d)/g

const CONTACT_CHECKS = new Map([
  [
    'postalCode',
    [isSyntheticPostcode, 'is not a synthetic (ZZ99 9ZZ) postcode']
  ],
  ['mobile', [isSyntheticMobile, 'is not in the 07700 900NNN range']],
  ['landline', [isSyntheticLandline, 'is not in the 01632 960NNN range']]
])

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

    await store.#loadBusinesses(dataPath, problems)
    await store.#loadCustomers(dataPath, problems)
    await store.#loadRelationships(dataPath, problems)

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

  async #loadBusinesses(dataPath, problems) {
    const docs = await readCollection(
      path.join(dataPath, COLLECTIONS.businesses),
      problems
    )
    for (const { name, doc } of docs) {
      const sbi = String(doc.sbi ?? '')
      const fileProblems = fixtureValueProblems(doc)

      if (!isSyntheticBusinessName(doc.info?.name)) {
        fileProblems.push(
          `info.name "${doc.info?.name}" does not start with "Test"`
        )
      }
      const problem = keyProblem('sbi', sbi, name, isSyntheticSbi)
      if (problem) {
        fileProblems.push(problem)
      } else {
        this.#businesses.set(sbi, { ...doc, sbi })
      }
      problems.push(...fileProblems.map((p) => `businesses/${name}: ${p}`))
    }
  }

  async #loadCustomers(dataPath, problems) {
    const docs = await readCollection(
      path.join(dataPath, COLLECTIONS.customers),
      problems
    )
    for (const { name, doc } of docs) {
      const crn = String(doc.crn ?? '')
      const fileProblems = fixtureValueProblems(doc)
      if (!isSyntheticSurname(doc.info?.name?.last)) {
        fileProblems.push(
          `info.name.last "${doc.info?.name?.last}" does not start with "Test-"`
        )
      }
      const problem = keyProblem('crn', crn, name, isSyntheticCrn)
      if (problem) {
        fileProblems.push(problem)
      } else {
        this.#customers.set(crn, { ...doc, crn })
      }
      problems.push(...fileProblems.map((p) => `customers/${name}: ${p}`))
    }
  }

  async #loadRelationships(dataPath, problems) {
    const docs = await readCollection(
      path.join(dataPath, COLLECTIONS.relationships),
      problems
    )
    for (const { name, doc } of docs) {
      const sbi = String(doc.sbi ?? '')
      const crn = String(doc.crn ?? '')
      const fileProblems = this.#relationshipProblems(name, doc, sbi, crn)
      if (fileProblems.length > 0) {
        problems.push(...fileProblems.map((p) => `relationships/${name}: ${p}`))
      } else {
        const relationship = { ...doc, sbi, crn }
        this.#relationships.set(relationshipKey(sbi, crn), relationship)
        pushTo(this.#relationshipsBySbi, sbi, relationship)
        pushTo(this.#relationshipsByCrn, crn, relationship)
      }
    }
  }

  #relationshipProblems(name, doc, sbi, crn) {
    const key = relationshipKey(sbi, crn)
    const problems = fixtureValueProblems(doc)
    if (name !== `${key}.json`) {
      problems.push(`file name does not match "${key}"`)
    }
    if (!this.#businesses.has(sbi)) {
      problems.push(`no business fixture for sbi "${sbi}"`)
    }
    if (!this.#customers.has(crn)) {
      problems.push(`no customer fixture for crn "${crn}"`)
    }
    problems.push(...permissionGroupProblems(doc.permissionGroups))
    return problems
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
    if (err.code !== 'ENOENT') {
      throw err
    }
    problems.push(`missing collection directory ${dir}`)
    return []
  }

  const results = await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map(async (name) => {
        try {
          const doc = JSON.parse(
            await fs.readFile(path.join(dir, name), 'utf8')
          )
          return { name, doc }
        } catch (err) {
          return { name, error: err.message }
        }
      })
  )

  const docs = []
  for (const { name, doc, error } of results) {
    if (doc === undefined) {
      problems.push(`${path.basename(dir)}/${name}: ${error}`)
    } else {
      docs.push({ name, doc })
    }
  }
  return docs
}

// A document's key must be synthetic and match its file name.
function keyProblem(field, value, name, isSynthetic) {
  if (!isSynthetic(value)) {
    return `${field} "${value}" is outside the synthetic ranges`
  }
  if (name !== `${value}.json`) {
    return `file name does not match ${field} "${value}"`
  }
  return null
}

// Any 9/10-digit run outside the synthetic ranges, and any postcode, phone
// number or email outside the synthetic conventions, anywhere in the document.
function fixtureValueProblems(value, keyPath = []) {
  if (value === null || value === undefined) {
    return []
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return scalarProblems(String(value), keyPath)
  }
  if (typeof value !== 'object') {
    return []
  }
  return Object.entries(value).flatMap(([key, item]) =>
    fixtureValueProblems(item, [...keyPath, key])
  )
}

function scalarProblems(text, keyPath) {
  const where = keyPath.join('.')
  return [
    ...contactProblems(text, keyPath.at(-1), where),
    ...identifierRunProblems(text, where)
  ]
}

function contactProblems(text, key, where) {
  const problems = []
  const check = CONTACT_CHECKS.get(key)
  if (check && !check[0](text)) {
    problems.push(`${where} "${text}" ${check[1]}`)
  }
  if (text.includes('@') && !isSyntheticEmail(text)) {
    problems.push(`${where} "${text}" is not an example.test email address`)
  }
  return problems
}

function identifierRunProblems(text, where) {
  const problems = []
  for (const [digits] of text.matchAll(IDENTIFIER_RUN)) {
    if (
      digits.length === CRN_LENGTH &&
      !isSyntheticCrn(digits) &&
      !isSyntheticFrn(digits)
    ) {
      problems.push(
        `${where} contains ${digits}, which looks like an issued CRN or FRN`
      )
    }
    if (digits.length === SBI_LENGTH && !isSyntheticSbi(digits)) {
      problems.push(
        `${where} contains ${digits}, which looks like an issued SBI`
      )
    }
  }
  return problems
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
