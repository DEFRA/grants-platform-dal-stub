import { createServer } from '#/server.js'
import { CustomerBusiness } from '#/graphql/resolvers/customer.js'

/**
 * Guarantees two things for the primary persona:
 *  1. every field the DAL schema exposes under Business and Customer can be
 *     queried without error (the selection is generated from the server's own
 *     introspection response, so a field added upstream after
 *     `npm run schema:sync` is covered automatically); and
 *  2. the fields the fixtures commit to (REQUIRED_PATHS) come back populated.
 * Fields outside that set resolve to null or an empty list, exactly as the real
 * DAL does for a business or customer without that data.
 */

const SBI = '300000001'
const CRN = '9300000001'

const REQUIRED_PATHS = {
  Business: [
    'sbi',
    'organisationId',
    'info.name',
    'info.reference',
    'info.vat',
    'info.email.address',
    'info.phone.mobile',
    'info.phone.landline',
    'info.address.line1',
    'info.address.city',
    'info.address.postalCode',
    'info.address.uprn',
    'info.type.code',
    'info.type.type',
    'info.legalStatus.code',
    'info.legalStatus.type',
    'info.registrationNumbers.companiesHouse',
    'land.parcels.*.id',
    'land.parcels.*.sheetId',
    'land.parcels.*.parcelId',
    'land.parcel.sheetId',
    'land.summary.totalParcels',
    'countyParishHoldings.*.cphNumber',
    'customers.*.crn',
    'customers.*.firstName',
    'customers.*.lastName',
    'customers.*.permissionGroups.*.id',
    'customers.*.permissionGroups.*.level',
    'customer.crn',
    'agreements.*.contractId',
    'agreements.*.status',
    'agreements.*.paymentSchedules.*.optionCode',
    'agreements.*.paymentSchedules.*.sheetName',
    'agreements.*.paymentSchedules.*.parcelName',
    'agreements.*.paymentSchedules.*.startDate',
    'agreements.*.paymentSchedules.*.endDate',
    'permittedFunctions.*.name',
    'permittedFunctions.*.permitted'
  ],
  Customer: [
    'crn',
    'personId',
    'info.name.title',
    'info.name.first',
    'info.name.last',
    'info.email.address',
    'info.phone.mobile',
    'info.address.line1',
    'info.address.city',
    'info.address.postalCode',
    'businesses.*.sbi',
    'businesses.*.name',
    'businesses.*.organisationId',
    'businesses.*.role',
    'businesses.*.permissionGroups.*.id',
    'businesses.*.permissionGroups.*.level',
    'businesses.*.permissionGroups.*.functions.*',
    'business.sbi',
    'business.permissionGroups.*.id'
  ]
}

const INTROSPECTION = `{
  __schema {
    types {
      name
      kind
      fields(includeDeprecated: true) {
        name
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
      }
    }
  }
}`

/** Arguments supplied for fields that need them. */
function argsFor(fieldName, parcel) {
  switch (fieldName) {
    case 'parcel':
    case 'parcelCovers':
    case 'parcelLandUses':
      return `(sheetId: "${parcel.sheetId}", parcelId: "${parcel.parcelId}")`
    case 'permittedFunctions':
      return '(functions: ["Submit CS Application", "Not a real function"])'
    case 'customer':
      return `(crn: "${CRN}")`
    case 'business':
      return `(sbi: "${SBI}")`
    default:
      return ''
  }
}

function namedType(typeRef) {
  let current = typeRef
  while (current.ofType) current = current.ofType
  return current
}

/** Builds a selection of every field reachable from `typeName`. */
function selectionFor(types, typeName, parcel, seen = new Set()) {
  const parts = []
  for (const field of types.get(typeName).fields ?? []) {
    const named = namedType(field.type)
    if (named.kind === 'SCALAR' || named.kind === 'ENUM') {
      parts.push(`${field.name}${argsFor(field.name, parcel)}`)
    } else if (named.kind === 'OBJECT' && !seen.has(named.name)) {
      const inner = selectionFor(
        types,
        named.name,
        parcel,
        new Set([...seen, named.name])
      )
      parts.push(`${field.name}${argsFor(field.name, parcel)} { ${inner} }`)
    }
  }
  return parts.join(' ')
}

/** Every leaf path in `value`, with array indices collapsed to `*`. */
function leafPaths(value, path = [], out = new Map()) {
  if (Array.isArray(value)) {
    if (value.length === 0) out.set(path.join('.'), [])
    value.forEach((item) => leafPaths(item, [...path, '*'], out))
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      leafPaths(item, [...path, key], out)
    }
  } else {
    const key = path.join('.')
    if (!out.has(key) || out.get(key) === null) out.set(key, value)
  }
  return out
}

const post = async (server, query) => {
  const response = await server.inject({
    method: 'POST',
    url: '/graphql',
    payload: { query }
  })
  return { statusCode: response.statusCode, body: JSON.parse(response.payload) }
}

describe('schema coverage for the primary persona', () => {
  let server
  let types
  let parcel

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
    const introspection = await post(server, INTROSPECTION)
    types = new Map(
      introspection.body.data.__schema.types.map((type) => [type.name, type])
    )
    const first = await post(
      server,
      `{ business(sbi: "${SBI}") { land { parcels { sheetId parcelId } } } }`
    )
    parcel = first.body.data.business.land.parcels[0]
  })

  afterAll(async () => {
    await server.stop()
  })

  test.each([
    ['Business', `business(sbi: "${SBI}")`],
    ['Customer', `customer(crn: "${CRN}")`]
  ])(
    '%s: every schema field is queryable and the committed fields are populated',
    async (typeName, root) => {
      const selection = selectionFor(types, typeName, parcel)
      const { statusCode, body } = await post(
        server,
        `{ ${root} { ${selection} } }`
      )

      expect(statusCode).toBe(200)
      expect(body.errors).toBeUndefined()

      const leaves = leafPaths(body.data[Object.keys(body.data)[0]])
      const missing = REQUIRED_PATHS[typeName].filter((path) => {
        const value = leaves.get(path)
        return value === undefined || value === null || value?.length === 0
      })
      expect(missing).toEqual([])
    }
  )

  test('permittedFunctions reflects the functions held by the business customers', async () => {
    const { body } = await post(
      server,
      `{ business(sbi: "${SBI}") { permittedFunctions(functions: ["Submit CS Application", "Not a real function"]) { name permitted } } }`
    )

    expect(body.data.business.permittedFunctions).toEqual([
      { name: 'Submit CS Application', permitted: true },
      { name: 'Not a real function', permitted: false }
    ])
  })
})

describe('CustomerBusiness.messages', () => {
  const messages = [
    { id: '1', date: '2026-01-01T00:00:00.000Z' },
    { id: '2', date: '2026-03-01T00:00:00.000Z' }
  ]

  test('returns every message without fromDate', () => {
    expect(CustomerBusiness.messages({ messages }, {})).toEqual(messages)
  })

  test('returns messages on or after fromDate', () => {
    expect(
      CustomerBusiness.messages({ messages }, { fromDate: '2026-02-01' })
    ).toEqual([messages[1]])
  })

  test('returns an empty list when the fixture has no messages', () => {
    expect(CustomerBusiness.messages({}, {})).toEqual([])
  })
})
