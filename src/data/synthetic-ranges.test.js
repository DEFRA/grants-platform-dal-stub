import {
  isSyntheticCrn,
  isSyntheticEmail,
  isSyntheticFrn,
  isSyntheticLandline,
  isSyntheticMobile,
  isSyntheticPostcode,
  isSyntheticSbi,
  syntheticRanges
} from './synthetic-ranges.js'

describe('synthetic identifier ranges', () => {
  test.each([
    '1200000001',
    '1200000003',
    '1300000001',
    '1300000100',
    '1400000009',
    1300000001
  ])('%s is a synthetic CRN', (crn) => {
    expect(isSyntheticCrn(crn)).toBe(true)
  })

  test.each([
    '1199999999', // valid CRN format, outside the synthetic blocks
    '1100000000', // valid CRN format, outside the synthetic blocks
    '1500000001', // block not reserved
    '130000001', // too short
    '13000000011', // too long
    'abc',
    ''
  ])('%s is not a synthetic CRN', (crn) => {
    expect(isSyntheticCrn(crn)).toBe(false)
  })

  test.each([
    '200000001',
    '200000003',
    '300000001',
    '300000100',
    '400000009',
    300000001
  ])('%s is a synthetic SBI', (sbi) => {
    expect(isSyntheticSbi(sbi)).toBe(true)
  })

  test.each([
    '199999999', // valid SBI format, outside the synthetic blocks
    '201234567', // synthetic prefix but not a sequential block number
    '500000001', // block not reserved
    '30000001', // too short
    ''
  ])('%s is not a synthetic SBI', (sbi) => {
    expect(isSyntheticSbi(sbi)).toBe(false)
  })

  test.each(['0300000001', '0200000099', '0400000100'])(
    '%s is a synthetic FRN (0 followed by a synthetic SBI)',
    (frn) => {
      expect(isSyntheticFrn(frn)).toBe(true)
    }
  )

  test.each([
    '1300000001', // a synthetic CRN is not an FRN
    '1100000001', // issued format
    '0100000001', // 0 followed by an issued-looking SBI
    '300000001', // the SBI alone
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
    expect(isSyntheticEmail('alice.carter+1300000001@example.test')).toBe(true)
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
