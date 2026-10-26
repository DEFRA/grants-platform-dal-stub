import { isSyntheticCrn, isSyntheticSbi } from './synthetic-ranges.js'

// Parses "from:to,from:to". Targets must be synthetic, sources must not be.
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

// Real-to-synthetic identifier map. resolve* maps a request id to the synthetic
// one; echo* maps a synthetic id back to its source when there is exactly one.
export class IdMapping {
  #crn
  #sbi
  #crnSources
  #sbiSources

  constructor({ crn = '', sbi = '' } = {}) {
    this.#crn = parseIdMap(crn, { kind: 'CRN', isSynthetic: isSyntheticCrn })
    this.#sbi = parseIdMap(sbi, { kind: 'SBI', isSynthetic: isSyntheticSbi })
    this.#crnSources = groupSources(this.#crn)
    this.#sbiSources = groupSources(this.#sbi)
  }

  get size() {
    return this.#crn.size + this.#sbi.size
  }

  get targets() {
    return {
      crn: [...this.#crnSources.keys()],
      sbi: [...this.#sbiSources.keys()]
    }
  }

  resolveCrn(crn) {
    return this.#crn.get(String(crn)) ?? String(crn)
  }

  resolveSbi(sbi) {
    return this.#sbi.get(String(sbi)) ?? String(sbi)
  }

  echoCrn(syntheticCrn) {
    return uniqueSource(this.#crnSources, syntheticCrn)
  }

  echoSbi(syntheticSbi) {
    return uniqueSource(this.#sbiSources, syntheticSbi)
  }

  forRequest() {
    return new RequestIdMapping(this)
  }

  validateAgainst(store) {
    const problems = [
      ...this.targets.crn
        .filter((crn) => !store.getCustomer(crn))
        .map((crn) => `CRN map target ${crn} has no customer fixture`),
      ...this.targets.sbi
        .filter((sbi) => !store.getBusiness(sbi))
        .map((sbi) => `SBI map target ${sbi} has no business fixture`)
    ]
    if (problems.length > 0) {
      throw new IdMappingValidationError(problems)
    }
  }
}

// Per-request view: ids the request supplied are echoed back exactly as supplied.
export class RequestIdMapping {
  #mapping
  #crn = new Map()
  #sbi = new Map()

  constructor(mapping) {
    this.#mapping = mapping
  }

  resolveCrn(crn) {
    const requested = String(crn)
    const synthetic = this.#mapping.resolveCrn(requested)
    if (!this.#crn.has(synthetic)) {
      this.#crn.set(synthetic, requested)
    }
    return synthetic
  }

  resolveSbi(sbi) {
    const requested = String(sbi)
    const synthetic = this.#mapping.resolveSbi(requested)
    if (!this.#sbi.has(synthetic)) {
      this.#sbi.set(synthetic, requested)
    }
    return synthetic
  }

  echoCrn(syntheticCrn) {
    return (
      this.#crn.get(String(syntheticCrn)) ?? this.#mapping.echoCrn(syntheticCrn)
    )
  }

  echoSbi(syntheticSbi) {
    return (
      this.#sbi.get(String(syntheticSbi)) ?? this.#mapping.echoSbi(syntheticSbi)
    )
  }
}

export class IdMappingValidationError extends Error {
  constructor(problems) {
    super(
      `Identifier mapping validation failed:\n  - ${problems.join('\n  - ')}`
    )
    this.name = 'IdMappingValidationError'
    this.problems = problems
  }
}

function groupSources(map) {
  const grouped = new Map()
  for (const [source, target] of map) {
    const sources = grouped.get(target)
    if (sources) {
      sources.push(source)
    } else {
      grouped.set(target, [source])
    }
  }
  return grouped
}

function uniqueSource(sourcesByTarget, synthetic) {
  const key = String(synthetic)
  const sources = sourcesByTarget.get(key)
  return sources?.length === 1 ? sources[0] : key
}
