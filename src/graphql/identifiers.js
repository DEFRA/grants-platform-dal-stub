import { BadUserInput } from './errors.js'

// The checks the DAL's @validateVariable directive applies to crn and sbi
// arguments. `source` is the pattern as written in the schema, so the message
// matches the DAL's.
const CRN = { pattern: /^[1-9]\d{9}$/, source: '^[1-9][0-9]{9}$' }
const SBI = { pattern: /^[1-9]\d{8}$/, source: '^[1-9][0-9]{8}$' }

export function validCrn(crn) {
  return validated('crn', crn, CRN)
}

export function validSbi(sbi) {
  return validated('sbi', sbi, SBI)
}

function validated(name, value, { pattern, source }) {
  const text = String(value)
  if (!pattern.test(text)) {
    throw new BadUserInput(`variable '${name}' must match pattern ${source}`)
  }
  return text
}
