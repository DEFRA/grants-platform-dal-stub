// The only identifier and contact-detail shapes allowed in fixtures. Issued CRNs
// are 10 digits starting 11, issued SBIs 9 digits starting 1, issued FRNs are
// CRN-shaped; these blocks sit outside all of them. Do not widen them.
//
//   CRN       1200000NNN, 1300000NNN, 1400000NNN
//   SBI       200000NNN, 300000NNN, 400000NNN
//   FRN       0 followed by a synthetic SBI
//   Postcode  ZZ<1-3 digits> <digit><2 letters>, e.g. ZZ99 9ZZ
//   Email     anything at example.test

const CRN_PATTERN = /^1[234]00000\d{3}$/
const SBI_PATTERN = /^[234]00000\d{3}$/
const FRN_PATTERN = /^0[234]00000\d{3}$/
const POSTCODE_PATTERN = /^ZZ\d{1,3} \d[A-Z]{2}$/
const EMAIL_DOMAIN = '@example.test'

export function isSyntheticCrn(crn) {
  return CRN_PATTERN.test(String(crn))
}

export function isSyntheticSbi(sbi) {
  return SBI_PATTERN.test(String(sbi))
}

export function isSyntheticFrn(frn) {
  return FRN_PATTERN.test(String(frn))
}

export function isSyntheticPostcode(postcode) {
  return POSTCODE_PATTERN.test(String(postcode))
}

export function isSyntheticEmail(email) {
  return String(email).endsWith(EMAIL_DOMAIN)
}

export const syntheticRanges = {
  crn: CRN_PATTERN,
  sbi: SBI_PATTERN,
  frn: FRN_PATTERN,
  postcode: POSTCODE_PATTERN,
  emailDomain: EMAIL_DOMAIN
}
