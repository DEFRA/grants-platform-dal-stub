import { BadRequest } from './errors.js'

// Same patterns as the @validateVariable directives on the DAL's crn/sbi arguments.
const CRN_PATTERN = /^[1-9]\d{9}$/
const SBI_PATTERN = /^[1-9]\d{8}$/

export function validCrn(crn) {
  const value = String(crn)
  if (!CRN_PATTERN.test(value)) {
    throw new BadRequest(
      'Invalid crn: expected a 10-digit number not starting with 0'
    )
  }
  return value
}

export function validSbi(sbi) {
  const value = String(sbi)
  if (!SBI_PATTERN.test(value)) {
    throw new BadRequest(
      'Invalid sbi: expected a 9-digit number not starting with 0'
    )
  }
  return value
}
