import {
  IdMapping,
  IdMappingValidationError,
  parseIdMap
} from './id-mapping.js'
import { isSyntheticCrn } from './synthetic-ranges.js'

describe('parseIdMap', () => {
  const options = { kind: 'CRN', isSynthetic: isSyntheticCrn }

  test('parses comma separated from:to pairs, ignoring whitespace and empties', () => {
    const map = parseIdMap(
      ' 1100000001:9000000001 , 1100000002 : 9000000002 ,, ',
      options
    )

    expect([...map]).toEqual([
      ['1100000001', '9000000001'],
      ['1100000002', '9000000002']
    ])
  })

  test('returns an empty map for blank, null or undefined input', () => {
    expect(parseIdMap('', options).size).toBe(0)
    expect(parseIdMap(null, options).size).toBe(0)
    expect(parseIdMap(undefined, options).size).toBe(0)
  })

  const rejected = [
    ['1100000001', 'CRN mapping entry 1: expected "from:to"'],
    ['1100000001:9000000001:extra', 'CRN mapping entry 1: expected "from:to"'],
    [':9000000001', 'CRN mapping entry 1: expected "from:to"'],
    [
      '1100000001:1100000002',
      'CRN mapping entry 1: target is outside the synthetic ranges'
    ],
    [
      '9000000001:9000000002',
      'CRN mapping entry 1: source is already a synthetic identifier'
    ],
    [
      '1100000001:9000000001,1100000001:9000000002',
      'CRN mapping entry 2: duplicates an earlier source'
    ]
  ]

  test.each(rejected)('rejects %j', (value, message) => {
    expect(() => parseIdMap(value, options)).toThrow(message)
  })

  // Sources are sign-in identifiers and a startup failure reaches stderr unredacted.
  test.each(rejected)('%j is not quoted in the error', (value) => {
    const error = (() => {
      try {
        return parseIdMap(value, options)
      } catch (err) {
        return err
      }
    })()

    expect(error).toBeInstanceOf(Error)
    for (const digits of value.match(/\d+/g)) {
      expect(error.message).not.toContain(digits)
    }
  })
})

describe('IdMapping', () => {
  test('is the identity when unconfigured', () => {
    const mapping = new IdMapping()

    expect(mapping.size).toBe(0)
    expect(mapping.targets).toEqual({ crn: [], sbi: [] })
    expect(mapping.resolveCrn('1100000001')).toBe('1100000001')
    expect(mapping.resolveSbi(199999999)).toBe('199999999')
    expect(mapping.echoCrn('9000000001')).toBe('9000000001')
    expect(mapping.echoSbi('800000001')).toBe('800000001')
  })

  test('resolves mapped identifiers to synthetic ones and echoes a unique source back', () => {
    const mapping = new IdMapping({
      crn: '1100000001:9000000001',
      sbi: '100000001:800000001,100000002:800000002'
    })

    expect(mapping.size).toBe(3)
    expect(mapping.targets).toEqual({
      crn: ['9000000001'],
      sbi: ['800000001', '800000002']
    })
    expect(mapping.resolveCrn('1100000001')).toBe('9000000001')
    expect(mapping.resolveSbi('100000002')).toBe('800000002')
    expect(mapping.echoCrn('9000000001')).toBe('1100000001')
    expect(mapping.echoSbi('800000001')).toBe('100000001')
    // Identifiers outside the map pass through untouched in both directions.
    expect(mapping.resolveSbi('800000050')).toBe('800000050')
    expect(mapping.echoSbi('800000050')).toBe('800000050')
  })

  test('allows several sources per target; echo is the synthetic id when ambiguous', () => {
    const mapping = new IdMapping({
      sbi: '100000001:800000001,100000002:800000001'
    })

    expect(mapping.resolveSbi('100000001')).toBe('800000001')
    expect(mapping.resolveSbi('100000002')).toBe('800000001')
    expect(mapping.echoSbi('800000001')).toBe('800000001')
    expect(mapping.targets.sbi).toEqual(['800000001'])
  })

  test('validates SBI entries against the SBI ranges', () => {
    expect(() => new IdMapping({ sbi: '100000001:9000000001' })).toThrow(
      'SBI mapping entry 1: target is outside the synthetic ranges'
    )
  })

  describe('validateAgainst', () => {
    const store = {
      getCustomer: (crn) => (crn === '9000000001' ? {} : null),
      getBusiness: (sbi) => (sbi === '800000001' ? {} : null)
    }

    test('passes when every target has a fixture', () => {
      const mapping = new IdMapping({
        crn: '1100000001:9000000001,1100000002:9000000001',
        sbi: '100000001:800000001'
      })

      expect(() => mapping.validateAgainst(store)).not.toThrow()
    })

    test('throws listing every target without a fixture', () => {
      const mapping = new IdMapping({
        crn: '1100000001:9000000001,1100000002:9000000099',
        sbi: '100000001:800000099'
      })

      const error = (() => {
        try {
          mapping.validateAgainst(store)
        } catch (err) {
          return err
        }
      })()

      expect(error).toBeInstanceOf(IdMappingValidationError)
      expect(error.problems).toEqual([
        'CRN map target 9000000099 has no customer fixture',
        'SBI map target 800000099 has no business fixture'
      ])
      expect(error.message).toContain('Identifier mapping validation failed')
    })
  })
})
