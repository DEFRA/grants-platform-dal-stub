import {
  isSyntheticCrn,
  isSyntheticEmail,
  isSyntheticFrn,
  isSyntheticLandline,
  isSyntheticMobile,
  isSyntheticPostcode,
  isSyntheticSbi,
  isSyntheticSurname,
  isSyntheticBusinessName,
  syntheticRanges
} from './synthetic-ranges.js'

describe('synthetic identifier ranges', () => {
  test.each([
    '9000000001',
    '9000000005',
    '9000000100',
    '9000000999',
    9000000001
  ])('%s is a synthetic CRN', (crn) => {
    expect(isSyntheticCrn(crn)).toBe(true)
  })

  test.each([
    '1199999999', // valid CRN format, outside the synthetic blocks
    '1100000000', // valid CRN format, outside the synthetic blocks
    '9100000001', // outside the block
    '1300000001', // valid format, not in the block
    '900000001', // too short
    '90000000011', // too long
    'abc',
    ''
  ])('%s is not a synthetic CRN', (crn) => {
    expect(isSyntheticCrn(crn)).toBe(false)
  })

  test.each(['800000001', '800000003', '800000100', '800000999', 800000001])(
    '%s is a synthetic SBI',
    (sbi) => {
      expect(isSyntheticSbi(sbi)).toBe(true)
    }
  )

  test.each([
    '199999999', // valid SBI format, outside the synthetic blocks
    '801234567', // synthetic prefix but not a sequential block number
    '700000001', // outside the block
    '80000001', // too short
    ''
  ])('%s is not a synthetic SBI', (sbi) => {
    expect(isSyntheticSbi(sbi)).toBe(false)
  })

  test.each(['7000000001', '7000000099', '7000000100'])(
    '%s is a synthetic FRN',
    (frn) => {
      expect(isSyntheticFrn(frn)).toBe(true)
    }
  )

  test.each([
    '9000000001', // a synthetic CRN is not an FRN
    '1100000001', // issued format
    '0800000001', // leading zero, read as a 9-digit number downstream
    '800000001', // the SBI alone
    ''
  ])('%s is not a synthetic FRN', (frn) => {
    expect(isSyntheticFrn(frn)).toBe(false)
  })

  test.each(['ZZ99 9ZZ', 'ZZ1 1ZZ', 'ZZ13 1ZZ', 'ZZ30 1AB'])(
    '%s is a synthetic postcode',
    (postcode) => {
      expect(isSyntheticPostcode(postcode)).toBe(true)
    }
  )

  test.each([
    'BB7 4LQ',
    'SK13 5CB',
    'W50 5UY',
    'ZZ101 9ZZ', // not a valid UK format
    'ZZ99 9CZ', // C is not used in inward codes
    'ZZ999ZZ',
    ''
  ])('%s is not a synthetic postcode', (postcode) => {
    expect(isSyntheticPostcode(postcode)).toBe(false)
  })

  test('phone numbers must be in the Ofcom drama ranges', () => {
    expect(isSyntheticMobile('07700900123')).toBe(true)
    expect(isSyntheticMobile('07700901123')).toBe(false)
    expect(isSyntheticMobile('07300000001')).toBe(false)
    expect(isSyntheticLandline('01632960123')).toBe(true)
    expect(isSyntheticLandline('01632961123')).toBe(false)
    expect(isSyntheticLandline('01300000001')).toBe(false)
  })

  test('only example.test email addresses are synthetic', () => {
    expect(isSyntheticEmail('alice.carter+9000000001@example.test')).toBe(true)
    expect(isSyntheticEmail('alice@example.com')).toBe(false)
    expect(isSyntheticEmail('alice@farm.co.uk')).toBe(false)
  })

  test('exposes the patterns for reuse', () => {
    expect(syntheticRanges.crn).toBeInstanceOf(RegExp)
    expect(syntheticRanges.sbi).toBeInstanceOf(RegExp)
    expect(syntheticRanges.frn).toBeInstanceOf(RegExp)
    expect(syntheticRanges.postcode).toBeInstanceOf(RegExp)
    expect(syntheticRanges.mobile).toBeInstanceOf(RegExp)
    expect(syntheticRanges.landline).toBeInstanceOf(RegExp)
    expect(syntheticRanges.emailDomain).toBe('@example.test')
  })
})

describe('synthetic names', () => {
  test.each(['Test-Lockwood', 'Test-B'])(
    '%s is a synthetic surname',
    (last) => {
      expect(isSyntheticSurname(last)).toBe(true)
    }
  )

  test.each(['Carter', 'Testerson', 'test-carter', '', undefined])(
    '%s is not a synthetic surname',
    (last) => {
      expect(isSyntheticSurname(last)).toBe(false)
    }
  )

  test.each([
    'Test Alder Carr Farm',
    'Test Clover Lea Farm Ltd',
    'Test Estates Ltd'
  ])('%s is a synthetic business name', (name) => {
    expect(isSyntheticBusinessName(name)).toBe(true)
  })

  test.each(['Green Farm', 'Green Test Farm', 'Testerson Farm', '', undefined])(
    '%s is not a synthetic business name',
    (name) => {
      expect(isSyntheticBusinessName(name)).toBe(false)
    }
  )
})
