import { isSyntheticCrn, isSyntheticSbi } from './synthetic-ranges.js'

/**
 * Parses a "from:to,from:to" string into a Map of source identifier to
 * synthetic identifier. The target must sit inside the synthetic ranges and the
 * source must not, otherwise the configuration is almost certainly the wrong
 * way round.
 */
export function parseIdMap(value, { kind, isSynthetic }) {
  const map = new Map()
  const entries = String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  for (const entry of entries) {
    const [source, target, ...rest] = entry
      .split(':')
      .map((part) => part.trim())
    if (!source || !target || rest.length > 0) {
      throw new Error(
        `Invalid ${kind} mapping entry "${entry}": expected "from:to"`
      )
    }
    if (!isSynthetic(target)) {
      throw new Error(
        `Invalid ${kind} mapping entry: target ${target} is outside the synthetic ranges`
      )
    }
    if (isSynthetic(source)) {
      throw new Error(
        `Invalid ${kind} mapping entry: source ${source} is already a synthetic identifier`
      )
    }
    if (map.has(source)) {
      throw new Error(`Duplicate ${kind} mapping for ${source}`)
    }
    map.set(source, target)
  }

  return map
}

/**
 * Bidirectional identifier mapping that lets a sign-in with identifiers the
 * fixtures do not contain reach synthetic fixture data. `resolve*` turns an
 * incoming identifier into the synthetic one used for fixture lookup; `echo*`
 * turns a synthetic identifier back into whatever the caller asked for so
 * responses stay consistent with the request. Identity when no mapping exists.
 */
export class IdMapping {
  #crn
  #sbi
  #crnReverse
  #sbiReverse

  constructor({ crn = '', sbi = '' } = {}) {
    this.#crn = parseIdMap(crn, { kind: 'CRN', isSynthetic: isSyntheticCrn })
    this.#sbi = parseIdMap(sbi, { kind: 'SBI', isSynthetic: isSyntheticSbi })
    this.#crnReverse = invert(this.#crn)
    this.#sbiReverse = invert(this.#sbi)
  }

  get size() {
    return this.#crn.size + this.#sbi.size
  }

  resolveCrn(crn) {
    return this.#crn.get(String(crn)) ?? String(crn)
  }

  resolveSbi(sbi) {
    return this.#sbi.get(String(sbi)) ?? String(sbi)
  }

  echoCrn(syntheticCrn) {
    return this.#crnReverse.get(String(syntheticCrn)) ?? String(syntheticCrn)
  }

  echoSbi(syntheticSbi) {
    return this.#sbiReverse.get(String(syntheticSbi)) ?? String(syntheticSbi)
  }
}

function invert(map) {
  const inverted = new Map()
  for (const [source, target] of map) {
    if (inverted.has(target)) {
      throw new Error(
        `Synthetic identifier ${target} is mapped from more than one source; responses could not be echoed unambiguously`
      )
    }
    inverted.set(target, source)
  }
  return inverted
}
