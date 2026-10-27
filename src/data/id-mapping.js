import { isSyntheticCrn, isSyntheticSbi } from './synthetic-ranges.js'

// Parses "from:to,from:to". Targets must be synthetic, sources must not be.
// Errors name the entry's position, never its values: sources are sign-in
// identifiers and a startup failure is printed to stderr unredacted.
export function parseIdMap(value, { kind, isSynthetic }) {
  const map = new Map()
  const entries = String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  entries.forEach((entry, index) => {
    const where = `${kind} mapping entry ${index + 1}`
    const [source, target, ...rest] = entry
      .split(':')
      .map((part) => part.trim())
    if (!source || !target || rest.length > 0) {
      throw new Error(`${where}: expected "from:to"`)
    }
    if (!isSynthetic(target)) {
      throw new Error(`${where}: target is outside the synthetic ranges`)
    }
    if (isSynthetic(source)) {
      throw new Error(`${where}: source is already a synthetic identifier`)
    }
    if (map.has(source)) {
      throw new Error(`${where}: duplicates an earlier source`)
    }
    map.set(source, target)
  })

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
