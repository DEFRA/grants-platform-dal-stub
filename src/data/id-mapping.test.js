import {
  IdMapping,
  IdMappingValidationError,
  RequestIdMapping,
  parseIdMap
} from './id-mapping.js'
import { isSyntheticCrn } from './synthetic-ranges.js'

describe('parseIdMap', () => {
  const options = { kind: 'CRN', isSynthetic: isSyntheticCrn }

  test('parses comma separated from:to pairs, ignoring whitespace and empties', () => {
    const map = parseIdMap(
      ' 1100000001:1300000001 , 1100000002 : 1300000002 ,, ',
      options
    )

    expect([...map]).toEqual([
      ['1100000001', '1300000001'],
      ['1100000002', '1300000002']
    ])
  })

  test('returns an empty map for blank, null or undefined input', () => {
    expect(parseIdMap('', options).size).toBe(0)
    expect(parseIdMap(null, options).size).toBe(0)
    expect(parseIdMap(undefined, options).size).toBe(0)
  })

  test.each([
    ['1100000001', 'expected "from:to"'],
    ['1100000001:1300000001:extra', 'expected "from:to"'],
    [':1300000001', 'expected "from:to"'],
    [
      '1100000001:1100000002',
      'target 1100000002 is outside the synthetic ranges'
    ],
    [
      '1300000001:1300000002',
      'source 1300000001 is already a synthetic identifier'
    ],
    [
      '1100000001:1300000001,1100000001:1300000002',
      'Duplicate CRN mapping for 1100000001'
    ]
  ])('rejects %j', (value, message) => {
    expect(() => parseIdMap(value, options)).toThrow(message)
  })
})

describe('IdMapping', () => {
  test('is the identity when unconfigured', () => {
    const mapping = new IdMapping()

    expect(mapping.size).toBe(0)
    expect(mapping.targets).toEqual({ crn: [], sbi: [] })
    expect(mapping.resolveCrn('1100000001')).toBe('1100000001')
    expect(mapping.resolveSbi(199999999)).toBe('199999999')
    expect(mapping.echoCrn('1300000001')).toBe('1300000001')
    expect(mapping.echoSbi('300000001')).toBe('300000001')
  })

  test('resolves mapped identifiers to synthetic ones and echoes a unique source back', () => {
    const mapping = new IdMapping({
      crn: '1100000001:1300000001',
      sbi: '100000001:300000001,100000002:300000002'
    })

    expect(mapping.size).toBe(3)
    expect(mapping.targets).toEqual({
      crn: ['1300000001'],
      sbi: ['300000001', '300000002']
    })
    expect(mapping.resolveCrn('1100000001')).toBe('1300000001')
    expect(mapping.resolveSbi('100000002')).toBe('300000002')
    expect(mapping.echoCrn('1300000001')).toBe('1100000001')
    expect(mapping.echoSbi('300000001')).toBe('100000001')
    // Identifiers outside the map pass through untouched in both directions.
    expect(mapping.resolveSbi('300000050')).toBe('300000050')
    expect(mapping.echoSbi('300000050')).toBe('300000050')
  })

  test('allows several sources per target; echo is the synthetic id when ambiguous', () => {
    const mapping = new IdMapping({
      sbi: '100000001:300000001,100000002:300000001'
    })

    expect(mapping.resolveSbi('100000001')).toBe('300000001')
    expect(mapping.resolveSbi('100000002')).toBe('300000001')
    expect(mapping.echoSbi('300000001')).toBe('300000001')
    expect(mapping.targets.sbi).toEqual(['300000001'])
  })

  test('validates SBI entries against the SBI ranges', () => {
    expect(() => new IdMapping({ sbi: '100000001:1300000001' })).toThrow(
      'Invalid SBI mapping entry'
    )
  })

  describe('validateAgainst', () => {
    const store = {
      getCustomer: (crn) => (crn === '1300000001' ? {} : null),
      getBusiness: (sbi) => (sbi === '300000001' ? {} : null)
    }

    test('passes when every target has a fixture', () => {
      const mapping = new IdMapping({
        crn: '1100000001:1300000001,1100000002:1300000001',
        sbi: '100000001:300000001'
      })

      expect(() => mapping.validateAgainst(store)).not.toThrow()
    })

    test('throws listing every target without a fixture', () => {
      const mapping = new IdMapping({
        crn: '1100000001:1300000001,1100000002:1300000099',
        sbi: '100000001:300000099'
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
        'CRN map target 1300000099 has no customer fixture',
        'SBI map target 300000099 has no business fixture'
      ])
      expect(error.message).toContain('Identifier mapping validation failed')
    })
  })
})

describe('RequestIdMapping', () => {
  const mapping = new IdMapping({
    crn: '1100000001:1300000001,1100000002:1300000001',
    sbi: '100000001:300000001'
  })

  test('is what forRequest returns', () => {
    expect(mapping.forRequest()).toBeInstanceOf(RequestIdMapping)
  })

  test('echoes identifiers exactly as the request supplied them', () => {
    const request = mapping.forRequest()

    expect(request.resolveCrn('1100000002')).toBe('1300000001')
    expect(request.echoCrn('1300000001')).toBe('1100000002')
    expect(request.resolveSbi('100000001')).toBe('300000001')
    expect(request.echoSbi(300000001)).toBe('100000001')
  })

  test('a synthetic id used directly stays synthetic', () => {
    const request = mapping.forRequest()

    expect(request.resolveSbi('300000001')).toBe('300000001')
    expect(request.echoSbi('300000001')).toBe('300000001')
  })

  test('falls back to the mapping for identifiers the request did not supply', () => {
    const request = mapping.forRequest()

    expect(request.echoSbi('300000001')).toBe('100000001') // unique source
    expect(request.echoCrn('1300000001')).toBe('1300000001') // two sources
    expect(request.echoCrn(1300000002)).toBe('1300000002') // unmapped
  })

  test('keeps the first identifier used for a synthetic one within a request', () => {
    const request = mapping.forRequest()
    request.resolveCrn('1100000001')
    request.resolveCrn('1100000002')

    expect(request.echoCrn('1300000001')).toBe('1100000001')
  })

  test('does not leak what one request supplied into another', () => {
    mapping.forRequest().resolveCrn('1100000002')

    expect(mapping.forRequest().echoCrn('1300000001')).toBe('1300000001')
  })
})
