// The only identifier and contact-detail shapes allowed in fixtures. Every
// value is valid in format, so downstream validation accepts it, but comes from
// a range that is unallocated or reserved for fiction. Do not widen them.
//
//   CRN       9000000NNN (issued CRNs start 1)
//   SBI       800000NNN (issued SBIs start 1)
//   FRN       0 followed by a synthetic SBI
//   Postcode  ZZ9 9AA / ZZ99 9AA (Royal Mail has no ZZ area)
//   Mobile    07700 900NNN (Ofcom drama range)
//   Landline  01632 960NNN (Ofcom drama range)
//   Email     anything at example.test

const CRN_PATTERN = /^9000000\d{3}$/
const SBI_PATTERN = /^800000\d{3}$/
const FRN_PATTERN = /^0800000\d{3}$/
const POSTCODE_PATTERN = /^ZZ\d{1,2} \d[ABD-HJLNP-UW-Z]{2}$/
const MOBILE_PATTERN = /^07700900\d{3}$/
const LANDLINE_PATTERN = /^01632960\d{3}$/
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

export function isSyntheticMobile(number) {
  return MOBILE_PATTERN.test(String(number))
}

export function isSyntheticLandline(number) {
  return LANDLINE_PATTERN.test(String(number))
}

export function isSyntheticEmail(email) {
  return String(email).endsWith(EMAIL_DOMAIN)
}

export const syntheticRanges = {
  crn: CRN_PATTERN,
  sbi: SBI_PATTERN,
  frn: FRN_PATTERN,
  postcode: POSTCODE_PATTERN,
  mobile: MOBILE_PATTERN,
  landline: LANDLINE_PATTERN,
  emailDomain: EMAIL_DOMAIN
}
