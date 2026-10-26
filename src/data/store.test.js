import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { DataStore, DataStoreValidationError } from './store.js'

const business = (sbi, extra = {}) => ({
  sbi,
  organisationId: '1',
  info: { name: `Business ${sbi}` },
  land: { parcels: [] },
  ...extra
})
const customer = (crn) => ({ crn, info: { name: { first: 'A', last: 'B' } } })
const relationship = (sbi, crn, permissionGroups = []) => ({
  sbi,
  crn,
  role: 'Business Partner',
  permissionGroups
})

async function writeFixtures(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dal-stub-store-'))
  for (const collection of ['businesses', 'customers', 'relationships']) {
    await fs.mkdir(path.join(dir, collection))
  }
  for (const [relativePath, content] of Object.entries(files)) {
    await fs.writeFile(
      path.join(dir, relativePath),
      typeof content === 'string' ? content : JSON.stringify(content)
    )
  }
  return dir
}

const expectProblems = async (dir, ...expected) => {
  const error = await DataStore.load(dir).catch((err) => err)
  expect(error).toBeInstanceOf(DataStoreValidationError)
  for (const fragment of expected) {
    expect(error.problems.join('\n')).toContain(fragment)
  }
  expect(error.message).toContain('Fixture validation failed')
}

describe('DataStore', () => {
  const dirs = []
  const load = async (files) => {
    const dir = await writeFixtures(files)
    dirs.push(dir)
    return dir
  }

  afterAll(async () => {
    await Promise.all(
      dirs.map((dir) => fs.rm(dir, { recursive: true, force: true }))
    )
  })

  test('loads valid collections and indexes relationships both ways', async () => {
    const dir = await load({
      'businesses/300000001.json': business('300000001'),
      'businesses/300000002.json': business('300000002'),
      'customers/9000000001.json': customer('9000000001'),
      'relationships/300000001-9000000001.json': relationship(
        '300000001',
        '9000000001',
        [{ id: 'BUSINESS_DETAILS', level: 'VIEW', functions: [] }]
      ),
      'relationships/300000002-9000000001.json': relationship(
        '300000002',
        '9000000001'
      )
    })

    const store = await DataStore.load(dir)

    expect(store.counts).toEqual({
      businesses: 2,
      customers: 1,
      relationships: 2
    })
    expect(store.getBusiness('300000001').info.name).toBe('Business 300000001')
    expect(store.getBusiness(300000001)).not.toBeNull()
    expect(store.getBusiness('300000009')).toBeNull()
    expect(store.getCustomer('9000000001').crn).toBe('9000000001')
    expect(store.getCustomer('9000000009')).toBeNull()
    expect(
      store.getRelationship('300000001', '9000000001').permissionGroups
    ).toHaveLength(1)
    expect(store.getRelationship('300000009', '9000000001')).toBeNull()
    expect(
      store.getRelationshipsForCustomer('9000000001').map((r) => r.sbi)
    ).toEqual(['300000001', '300000002'])
    expect(
      store.getRelationshipsForBusiness('300000002').map((r) => r.crn)
    ).toEqual(['9000000001'])
    expect(store.getRelationshipsForBusiness('300000009')).toEqual([])
    expect(store.listBusinesses()).toHaveLength(2)
    expect(store.listCustomers()).toHaveLength(1)
    expect(store.listRelationships()).toHaveLength(2)
  })

  test('accepts numeric identifiers in fixtures but normalises them to strings', async () => {
    const dir = await load({
      'businesses/300000001.json': business(300000001),
      'customers/9000000001.json': customer(9000000001),
      'relationships/300000001-9000000001.json': relationship(
        300000001,
        9000000001
      )
    })

    const store = await DataStore.load(dir)

    expect(store.getBusiness('300000001').sbi).toBe('300000001')
    expect(store.getCustomer('9000000001').crn).toBe('9000000001')
  })

  test('rejects a business whose SBI is outside the synthetic ranges', async () => {
    const dir = await load({
      'businesses/199999999.json': business('199999999')
    })

    await expectProblems(
      dir,
      'businesses/199999999.json: sbi "199999999" is outside the synthetic ranges'
    )
  })

  test('rejects a customer whose CRN is outside the synthetic ranges', async () => {
    const dir = await load({
      'customers/1199999999.json': customer('1199999999')
    })

    await expectProblems(
      dir,
      'customers/1199999999.json: crn "1199999999" is outside the synthetic ranges'
    )
  })

  test('rejects files whose name does not match their identifier', async () => {
    const dir = await load({
      'businesses/300000001.json': business('300000002'),
      'customers/9000000001.json': customer('9000000002')
    })

    await expectProblems(
      dir,
      'businesses/300000001.json: file name does not match sbi "300000002"',
      'customers/9000000001.json: file name does not match crn "9000000002"'
    )
  })

  test('rejects relationships that reference missing fixtures or lack permission groups', async () => {
    const dir = await load({
      'businesses/300000001.json': business('300000001'),
      'customers/9000000001.json': customer('9000000001'),
      'relationships/300000009-9000000009.json': {
        sbi: '300000009',
        crn: '9000000009'
      },
      'relationships/wrong-name.json': relationship('300000001', '9000000001')
    })

    await expectProblems(
      dir,
      'relationships/300000009-9000000009.json: no business fixture for sbi "300000009"',
      'relationships/300000009-9000000009.json: no customer fixture for crn "9000000009"',
      'relationships/300000009-9000000009.json: permissionGroups must be an array',
      'relationships/wrong-name.json: file name does not match "300000001-9000000001"'
    )
  })

  test('flags an issued-looking identifier anywhere in a document', async () => {
    const dir = await load({
      'businesses/300000001.json': business('300000001', {
        info: { name: 'Farm 1100000001', reference: '1100000002' }
      }),
      'customers/9000000001.json': {
        ...customer('9000000001'),
        notes: ['lives next to 106238911']
      }
    })

    await expectProblems(
      dir,
      'businesses/300000001.json: info.name contains 1100000001, which looks like an issued CRN or FRN',
      'businesses/300000001.json: info.reference contains 1100000002, which looks like an issued CRN or FRN',
      'customers/9000000001.json: notes.0 contains 106238911, which looks like an issued SBI'
    )
  })

  test('accepts synthetic FRNs, UPRNs and phone numbers', async () => {
    const dir = await load({
      'businesses/300000001.json': business('300000001', {
        info: {
          name: 'Business',
          reference: '0300000001',
          frn: '0300000001',
          phone: { mobile: '07700900301', landline: '01632960301' },
          address: { postalCode: 'ZZ30 1ZZ', uprn: '900000300001' }
        }
      })
    })

    const store = await DataStore.load(dir)

    expect(store.counts.businesses).toBe(1)
  })

  test('rejects postcodes, phone numbers and email addresses that are not synthetic', async () => {
    const dir = await load({
      'businesses/300000001.json': business('300000001', {
        info: {
          name: 'Business',
          email: { address: 'contact@realfarm.co.uk' },
          phone: { mobile: '07300000001', landline: '01300000001' },
          address: { postalCode: 'SK13 5CB' }
        }
      }),
      'customers/9000000001.json': {
        ...customer('9000000001'),
        info: {
          name: { first: 'A', last: 'B' },
          email: { address: 'a.b+9000000001@example.test' },
          phone: { mobile: '07700900101' },
          address: { postalCode: 'ZZ13 1ZZ' }
        }
      }
    })

    await expectProblems(
      dir,
      'businesses/300000001.json: info.email.address "contact@realfarm.co.uk" is not an example.test email address',
      'businesses/300000001.json: info.phone.mobile "07300000001" is not in the 07700 900NNN range',
      'businesses/300000001.json: info.phone.landline "01300000001" is not in the 01632 960NNN range',
      'businesses/300000001.json: info.address.postalCode "SK13 5CB" is not a synthetic (ZZ99 9ZZ) postcode'
    )
    const error = await DataStore.load(dir).catch((err) => err)
    expect(error.problems.filter((p) => p.startsWith('customers/'))).toEqual([])
  })

  test('rejects permission groups with unknown ids or levels', async () => {
    const dir = await load({
      'businesses/300000001.json': business('300000001'),
      'customers/9000000001.json': customer('9000000001'),
      'relationships/300000001-9000000001.json': relationship(
        '300000001',
        '9000000001',
        [
          { id: 'NOT_A_GROUP', level: 'VIEW', functions: [] },
          { id: 'BUSINESS_DETAILS', level: 'EVERYTHING', functions: [] },
          { id: 'BUSINESS_DETAILS', level: 'VIEW', functions: 'View' }
        ]
      )
    })

    await expectProblems(
      dir,
      'relationships/300000001-9000000001.json: permissionGroups[0].id "NOT_A_GROUP" is not a permission group id',
      'relationships/300000001-9000000001.json: permissionGroups[1].level "EVERYTHING" is not a level of BUSINESS_DETAILS',
      'relationships/300000001-9000000001.json: permissionGroups[2].functions must be an array',
      'relationships/300000001-9000000001.json: permissionGroups[2].id "BUSINESS_DETAILS" appears more than once'
    )
  })

  test('rejects malformed JSON and reports the file', async () => {
    const dir = await load({ 'businesses/300000001.json': '{ not json' })

    await expectProblems(dir, 'businesses/300000001.json:')
  })

  test('reports missing collection directories', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dal-stub-empty-'))
    dirs.push(dir)

    await expectProblems(dir, 'missing collection directory')
  })

  test('ignores non-JSON files', async () => {
    const dir = await load({
      'businesses/300000001.json': business('300000001'),
      'businesses/README.md': '# notes'
    })

    const store = await DataStore.load(dir)

    expect(store.counts.businesses).toBe(1)
  })
})
