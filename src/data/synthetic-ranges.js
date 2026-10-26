/**
 * The only identifier ranges allowed in this repository's fixtures.
 *
 * Issued CRNs are 10-digit numbers starting 11xx and issued SBIs are 9-digit
 * numbers starting with 1. The blocks below are obviously sequential and sit
 * outside anything the Rural Payments Agency issues. The data loader (and so
 * `npm run check:fixtures`, the tests and server startup) refuses anything
 * else, so an issued identifier cannot be committed by accident. Do not widen
 * these to make a test pass.
 *
 * CRN blocks: 1200000NNN, 1300000NNN, 1400000NNN
 * SBI blocks:  200000NNN,  300000NNN,  400000NNN
 */

const CRN_PATTERN = /^1[234]00000\d{3}$/
const SBI_PATTERN = /^[234]00000\d{3}$/

export function isSyntheticCrn(crn) {
  return CRN_PATTERN.test(String(crn))
}

export function isSyntheticSbi(sbi) {
  return SBI_PATTERN.test(String(sbi))
}

export const syntheticRanges = {
  crn: CRN_PATTERN,
  sbi: SBI_PATTERN
}
