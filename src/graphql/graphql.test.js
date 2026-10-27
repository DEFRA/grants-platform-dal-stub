import { createServer } from '#/server.js'
import { IdMapping, IdMappingValidationError } from '#/data/id-mapping.js'

/**
 * Exercises the stub with the query shapes DAL consumers send: permissions,
 * land parcels, business and customer details, county parish holdings and
 * agreements, plus DAL-style error handling and identifier mapping.
 */

const CS_PERSONA_CRN = '9000000001'
const CS_PERSONA_SBI = '800000001'
const SBI_WITH_AGREEMENTS = '800000001'
const SBI_WITHOUT_AGREEMENTS = '800000002'
const OTHER_CRN = '9000000005'
const SBI_PATTERN_MESSAGE = "variable 'sbi' must match pattern ^[1-9][0-9]{8}$"
const CRN_PATTERN_MESSAGE = "variable 'crn' must match pattern ^[1-9][0-9]{9}$"

// The Apollo integration writes the response as a JSON string, so parse it.
const postGraphql = async (server, payload, headers = {}) => {
  const response = await server.inject({
    method: 'POST',
    url: '/graphql',
    payload,
    headers: { 'content-type': 'application/json', ...headers }
  })
  return { statusCode: response.statusCode, body: JSON.parse(response.payload) }
}

describe('POST /graphql', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('business and customer queries', () => {
    test('GetBusinessPermissions returns the permission groups for a customer/business pair', async () => {
      const response = await postGraphql(server, {
        query: `
          query GetBusinessPermissions {
            customer(crn: "${CS_PERSONA_CRN}") {
              business(sbi: "${CS_PERSONA_SBI}") {
                permissionGroups {
                  id
                  level
                  functions
                }
              }
            }
          }`
      })

      expect(response.statusCode).toBe(200)
      expect(response.body.errors).toBeUndefined()
      expect(
        response.body.data.customer.business.permissionGroups
      ).toContainEqual(
        expect.objectContaining({
          id: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS',
          level: 'SUBMIT',
          functions: expect.arrayContaining(['Submit CS Application'])
        })
      )
    })

    test('customer.business is null when the customer has no relationship with the business', async () => {
      const response = await postGraphql(server, {
        query: `{ customer(crn: "${CS_PERSONA_CRN}") { business(sbi: "${SBI_WITHOUT_AGREEMENTS}") { permissionGroups { id } } } }`
      })

      expect(response.statusCode).toBe(200)
      expect(response.body.data.customer.business).toBeNull()
    })

    test('Business parcels query ignores the date argument and returns sheet and parcel ids', async () => {
      const response = await postGraphql(server, {
        query: `
          query Business {
            business(sbi: "${SBI_WITH_AGREEMENTS}") {
              land {
                parcels(date: "${new Date().toISOString()}") {
                  parcelId
                  sheetId
                }
              }
            }
          }`
      })

      expect(response.statusCode).toBe(200)
      expect(response.body.data.business.land.parcels).toContainEqual({
        parcelId: '1056',
        sheetId: 'SD8343'
      })
    })

    test('Business and customer information query returns the full address shape', async () => {
      const response = await postGraphql(server, {
        query: `
          query Business {
            customer(crn: "${CS_PERSONA_CRN}") {
              info { name { title first middle last } }
            }
            business(sbi: "${CS_PERSONA_SBI}") {
              info {
                reference
                email { address }
                phone { mobile landline }
                name
                address {
                  line1 line2 line3 line4 line5 street city postalCode uprn county
                  buildingName buildingNumberRange dependentLocality doubleDependentLocality
                  flatName pafOrganisationName
                }
              }
            }
          }`
      })

      expect(response.statusCode).toBe(200)
      expect(response.body.errors).toBeUndefined()
      const { customer, business } = response.body.data
      expect(customer.info.name).toEqual({
        title: 'Ms',
        first: 'Alice',
        middle: 'Louise',
        last: 'Carter'
      })
      expect(business.info.name).toBe('Green Farm')
      expect(business.info.email.address).toMatch(/@example\.test$/)
      expect(business.info.address).toEqual(
        expect.objectContaining({
          postalCode: 'ZZ30 1ZZ',
          uprn: expect.any(String)
        })
      )
    })

    test('Business and CPH query returns vat, type and county parish holdings', async () => {
      const response = await postGraphql(server, {
        query: `
          query Business {
            business(sbi: "${CS_PERSONA_SBI}") {
              info { vat type { code type } }
              countyParishHoldings { cphNumber }
            }
          }`
      })

      expect(response.statusCode).toBe(200)
      expect(response.body.errors).toBeUndefined()
      expect(response.body.data.business.countyParishHoldings).toEqual([
        expect.objectContaining({ cphNumber: expect.any(String) })
      ])
    })
  })

  describe('agreements query with variables', () => {
    const query = `
      query GetBusiness($sbi: ID!) {
        business(sbi: $sbi) {
          agreements {
            status
            paymentSchedules {
              optionCode
              sheetName
              parcelName
              actionArea
              actionMTL
              actionUnits
              startDate
              endDate
            }
          }
        }
      }`

    test('returns agreements and payment schedules using variables', async () => {
      const response = await postGraphql(server, {
        query,
        variables: { sbi: SBI_WITH_AGREEMENTS }
      })

      expect(response.statusCode).toBe(200)
      expect(response.body.data.business.agreements[0]).toEqual({
        status: 'SIGNED',
        paymentSchedules: expect.arrayContaining([
          expect.objectContaining({
            optionCode: 'MOR1',
            sheetName: 'SD8343',
            parcelName: '1056',
            actionArea: 50,
            actionMTL: null,
            actionUnits: null
          })
        ])
      })
    })

    test('returns an empty agreement list for a business without agreements', async () => {
      const response = await postGraphql(server, {
        query,
        variables: { sbi: SBI_WITHOUT_AGREEMENTS }
      })

      expect(response.statusCode).toBe(200)
      expect(response.body).toEqual({
        data: { business: { agreements: [] } }
      })
    })
  })

  describe('DAL-shaped errors', () => {
    test('unknown SBI is a NOT FOUND GraphQL error with HTTP 404', async () => {
      const response = await postGraphql(server, {
        query: '{ business(sbi: "999999999") { sbi } }'
      })

      expect(response.statusCode).toBe(404)
      expect(response.body.data).toEqual({ business: null })
      expect(response.body.errors).toEqual([
        expect.objectContaining({
          message: 'Business not found',
          path: ['business'],
          extensions: { code: 'NOT FOUND' }
        })
      ])
    })

    test('unknown CRN is a NOT FOUND GraphQL error', async () => {
      const response = await postGraphql(server, {
        query: '{ customer(crn: "9999999999") { crn } }'
      })

      expect(response.statusCode).toBe(404)
      expect(response.body.errors[0].extensions.code).toBe('NOT FOUND')
    })

    test('a CRN that is not associated with the business is NOT FOUND on business.customer', async () => {
      const response = await postGraphql(server, {
        query: `{ business(sbi: "${SBI_WITH_AGREEMENTS}") { customer(crn: "${OTHER_CRN}") { crn } } }`
      })

      expect(response.statusCode).toBe(404)
      expect(response.body.errors[0].message).toBe('Customer not found')
    })

    test('unknown parcel is NOT FOUND', async () => {
      const response = await postGraphql(server, {
        query: `{ business(sbi: "${SBI_WITH_AGREEMENTS}") { land { parcel(sheetId: "XX0000", parcelId: "0000") { id } } } }`
      })

      expect(response.statusCode).toBe(404)
      expect(response.body.errors[0].extensions.code).toBe('NOT FOUND')
    })

    test.each([
      [
        'business(sbi) with a leading zero',
        '{ business(sbi: "080000001") { sbi } }',
        SBI_PATTERN_MESSAGE
      ],
      [
        'business(sbi) with 10 digits',
        '{ business(sbi: "3000000001") { sbi } }',
        SBI_PATTERN_MESSAGE
      ],
      [
        'customer(crn) that is not numeric',
        '{ customer(crn: "not-a-crn") { crn } }',
        CRN_PATTERN_MESSAGE
      ],
      [
        'customer.business(sbi) that is too short',
        `{ customer(crn: "${CS_PERSONA_CRN}") { business(sbi: "80000001") { sbi } } }`,
        SBI_PATTERN_MESSAGE
      ],
      [
        'business.customer(crn) with a leading zero',
        `{ business(sbi: "${CS_PERSONA_SBI}") { customer(crn: "0900000001") { crn } } }`,
        CRN_PATTERN_MESSAGE
      ]
    ])(
      'malformed %s is a BAD_USER_INPUT error with HTTP 200, as the DAL directive answers',
      async (_description, query, message) => {
        const response = await postGraphql(server, { query })

        expect(response.statusCode).toBe(200)
        expect(response.body.errors).toHaveLength(1)
        expect(response.body.errors[0].extensions).toEqual({
          code: 'BAD_USER_INPUT'
        })
        expect(response.body.errors[0].message).toBe(message)
      }
    )

    test('invalid query is a GRAPHQL_VALIDATION_FAILED error with HTTP 400', async () => {
      const response = await postGraphql(server, {
        query: '{ business(sbi: "800000001") { noSuchField } }'
      })

      expect(response.statusCode).toBe(400)
      expect(response.body.errors[0].extensions.code).toBe(
        'GRAPHQL_VALIDATION_FAILED'
      )
    })
  })

  describe('wider schema coverage', () => {
    test('business.customers and customer.businesses are derived from relationships', async () => {
      const response = await postGraphql(server, {
        query: `{
          business(sbi: "${CS_PERSONA_SBI}") {
            sbi
            organisationId
            customers { crn firstName lastName role personId permissionGroups { id level } }
          }
          customer(crn: "${CS_PERSONA_CRN}") {
            crn
            personId
            businesses { sbi name organisationId role }
          }
        }`
      })

      expect(response.statusCode).toBe(200)
      expect(response.body.errors).toBeUndefined()
      const { business, customer } = response.body.data
      expect(business.sbi).toBe(CS_PERSONA_SBI)
      expect(business.customers.map((c) => c.crn)).toContain(CS_PERSONA_CRN)
      expect(customer.crn).toBe(CS_PERSONA_CRN)
      expect(customer.businesses).toEqual([
        expect.objectContaining({
          sbi: CS_PERSONA_SBI,
          name: 'Green Farm',
          organisationId: business.organisationId
        })
      ])
    })

    test('land parcel, summary, covers and land uses resolve from the fixture', async () => {
      const response = await postGraphql(server, {
        query: `{
          business(sbi: "${SBI_WITH_AGREEMENTS}") {
            land {
              parcel(sheetId: "SD8343", parcelId: "1056") { id sheetId parcelId area }
              parcelCovers(sheetId: "SD8343", parcelId: "1056") { id name }
              parcelLandUses(sheetId: "SD8343", parcelId: "1056") { code }
              summary { totalParcels totalArea }
            }
          }
        }`
      })

      expect(response.statusCode).toBe(200)
      expect(response.body.errors).toBeUndefined()
      const { land } = response.body.data.business
      expect(land.parcel).toEqual({
        id: 'SD8343-1056',
        sheetId: 'SD8343',
        parcelId: '1056',
        area: null
      })
      expect(land.parcelCovers).toEqual([])
      expect(land.parcelLandUses).toEqual([])
      expect(land.summary.totalParcels).toBe(5)
    })

    test('permissionGroups reference data is served from the vendored DAL file', async () => {
      const response = await postGraphql(server, {
        query:
          '{ permissionGroups { id name permissions { level functions } } }'
      })

      expect(response.statusCode).toBe(200)
      expect(response.body.data.permissionGroups).toContainEqual(
        expect.objectContaining({
          id: 'BUSINESS_DETAILS',
          name: 'Business details'
        })
      )
    })

    test('Authorization and Defra ID headers are accepted and ignored', async () => {
      const response = await postGraphql(
        server,
        { query: `{ business(sbi: "${SBI_WITH_AGREEMENTS}") { sbi } }` },
        {
          authorization: 'Bearer not-a-real-token',
          'x-forwarded-authorization': 'not-a-real-defra-id-token',
          'gateway-type': 'external'
        }
      )

      expect(response.statusCode).toBe(200)
      expect(response.body.data.business.sbi).toBe(SBI_WITH_AGREEMENTS)
    })
  })

  describe('GET /health', () => {
    test('responds with success', async () => {
      const response = await server.inject({ method: 'GET', url: '/health' })

      expect(response.statusCode).toBe(200)
      expect(response.result).toEqual({ message: 'success' })
    })
  })
})

describe('POST /graphql with an identifier mapping', () => {
  const REAL_CRN = '1100000001'
  const REAL_SBI = '100000001'
  let server

  beforeAll(async () => {
    server = await createServer({
      idMapping: new IdMapping({
        crn: `${REAL_CRN}:${CS_PERSONA_CRN}`,
        sbi: `${REAL_SBI}:${CS_PERSONA_SBI}`
      })
    })
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  test('resolves the mapped identifiers to synthetic fixtures and echoes the requested ids', async () => {
    const response = await postGraphql(server, {
      query: `{
        customer(crn: "${REAL_CRN}") {
          crn
          info { name { last } }
          business(sbi: "${REAL_SBI}") { sbi name permissionGroups { id level } }
          businesses { sbi }
        }
        business(sbi: "${REAL_SBI}") {
          sbi
          info { name }
          customer(crn: "${REAL_CRN}") { crn }
          customers { crn }
        }
      }`
    })

    expect(response.statusCode).toBe(200)
    expect(response.body.errors).toBeUndefined()
    const { customer, business } = response.body.data
    expect(customer.crn).toBe(REAL_CRN)
    expect(customer.info.name.last).toBe('Carter')
    expect(customer.business.sbi).toBe(REAL_SBI)
    expect(customer.business.permissionGroups).toContainEqual({
      id: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS',
      level: 'SUBMIT'
    })
    expect(customer.businesses).toEqual([{ sbi: REAL_SBI }])
    expect(business.sbi).toBe(REAL_SBI)
    expect(business.info.name).toBe('Green Farm')
    expect(business.customer.crn).toBe(REAL_CRN)
    expect(business.customers.map((c) => c.crn)).toContain(REAL_CRN)
  })

  test('a synthetic id used directly is echoed as itself; lists still translate to the unique source', async () => {
    const response = await postGraphql(server, {
      query: `{
        customer(crn: "${CS_PERSONA_CRN}") {
          crn
          business(sbi: "${CS_PERSONA_SBI}") { sbi }
          businesses { sbi }
        }
        business(sbi: "${CS_PERSONA_SBI}") {
          sbi
          customers { crn }
        }
      }`
    })

    expect(response.statusCode).toBe(200)
    expect(response.body.errors).toBeUndefined()
    const { customer, business } = response.body.data
    expect(customer.crn).toBe(CS_PERSONA_CRN)
    expect(customer.business.sbi).toBe(CS_PERSONA_SBI)
    expect(customer.businesses).toEqual([{ sbi: REAL_SBI }])
    expect(business.sbi).toBe(CS_PERSONA_SBI)
    expect(business.customers.map((c) => c.crn)).toContain(REAL_CRN)
    expect(business.customers.map((c) => c.crn)).not.toContain(CS_PERSONA_CRN)
  })

  test('echoes do not depend on selection order', async () => {
    const queries = [
      `{ customer(crn: "${REAL_CRN}") { businesses { sbi } business(sbi: "${CS_PERSONA_SBI}") { sbi } } }`,
      `{ customer(crn: "${REAL_CRN}") { business(sbi: "${CS_PERSONA_SBI}") { sbi } businesses { sbi } } }`
    ]

    for (const query of queries) {
      const response = await postGraphql(server, { query })

      expect(response.body.errors).toBeUndefined()
      expect(response.body.data.customer).toEqual({
        businesses: [{ sbi: REAL_SBI }],
        business: { sbi: CS_PERSONA_SBI }
      })
    }
  })

  test('aliases asking for the mapped and the synthetic id each get what they asked for', async () => {
    const response = await postGraphql(server, {
      query: `{
        mapped: business(sbi: "${REAL_SBI}") { sbi }
        synthetic: business(sbi: "${CS_PERSONA_SBI}") { sbi }
      }`
    })

    expect(response.body.errors).toBeUndefined()
    expect(response.body.data).toEqual({
      mapped: { sbi: REAL_SBI },
      synthetic: { sbi: CS_PERSONA_SBI }
    })
  })

  test('unmapped synthetic identifiers keep working alongside the mapping', async () => {
    const response = await postGraphql(server, {
      query: `{ business(sbi: "${SBI_WITHOUT_AGREEMENTS}") { sbi } }`
    })

    expect(response.statusCode).toBe(200)
    expect(response.body.data.business.sbi).toBe(SBI_WITHOUT_AGREEMENTS)
  })
})

describe('POST /graphql with several sign-ins mapped to one persona', () => {
  const FIRST_CRN = '1100000001'
  const SECOND_CRN = '1100000002'
  const REAL_SBI = '100000001'
  let server

  beforeAll(async () => {
    server = await createServer({
      idMapping: new IdMapping({
        crn: `${FIRST_CRN}:${CS_PERSONA_CRN},${SECOND_CRN}:${CS_PERSONA_CRN}`,
        sbi: `${REAL_SBI}:${CS_PERSONA_SBI}`
      })
    })
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  test.each([FIRST_CRN, SECOND_CRN])(
    'sign-in %s reaches the persona and is echoed back as itself',
    async (crn) => {
      const response = await postGraphql(server, {
        query: `{
          customer(crn: "${crn}") {
            crn
            info { name { last } }
            business(sbi: "${REAL_SBI}") { sbi permissionGroups { id } }
          }
        }`
      })

      expect(response.statusCode).toBe(200)
      expect(response.body.errors).toBeUndefined()
      const { customer } = response.body.data
      expect(customer.crn).toBe(crn)
      expect(customer.info.name.last).toBe('Carter')
      expect(customer.business.sbi).toBe(REAL_SBI)
      expect(customer.business.permissionGroups).not.toHaveLength(0)
    }
  )

  test('a shared persona the request did not name is returned with its synthetic CRN', async () => {
    const response = await postGraphql(server, {
      query: `{ business(sbi: "${REAL_SBI}") { sbi customers { crn } } }`
    })

    expect(response.statusCode).toBe(200)
    const { business } = response.body.data
    expect(business.sbi).toBe(REAL_SBI)
    expect(business.customers.map((c) => c.crn)).toContain(CS_PERSONA_CRN)
  })
})

describe('createServer with a mapping whose target has no fixture', () => {
  test('refuses to start and names the missing fixtures', async () => {
    const error = await createServer({
      idMapping: new IdMapping({
        crn: '1100000009:9000000099',
        sbi: '100000009:800000099'
      })
    }).catch((err) => err)

    expect(error).toBeInstanceOf(IdMappingValidationError)
    expect(error.problems).toEqual([
      'CRN map target 9000000099 has no customer fixture',
      'SBI map target 800000099 has no business fixture'
    ])
  })
})
