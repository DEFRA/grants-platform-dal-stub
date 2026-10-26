import {
  isSyntheticCrn,
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

  test('exposes the patterns for reuse', () => {
    expect(syntheticRanges.crn).toBeInstanceOf(RegExp)
    expect(syntheticRanges.sbi).toBeInstanceOf(RegExp)
  })
})
