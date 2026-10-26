import { IdMapping, parseIdMap } from './id-mapping.js'
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
    expect(mapping.resolveCrn('1100000001')).toBe('1100000001')
    expect(mapping.resolveSbi(199999999)).toBe('199999999')
    expect(mapping.echoCrn('1300000001')).toBe('1300000001')
    expect(mapping.echoSbi('300000001')).toBe('300000001')
  })

  test('resolves mapped identifiers to synthetic ones and echoes them back', () => {
    const mapping = new IdMapping({
      crn: '1100000001:1300000001',
      sbi: '100000001:300000001,100000002:300000002'
    })

    expect(mapping.size).toBe(3)
    expect(mapping.resolveCrn('1100000001')).toBe('1300000001')
    expect(mapping.resolveSbi('100000002')).toBe('300000002')
    expect(mapping.echoCrn('1300000001')).toBe('1100000001')
    expect(mapping.echoSbi('300000001')).toBe('100000001')
    // Identifiers outside the map pass through untouched in both directions.
    expect(mapping.resolveSbi('300000050')).toBe('300000050')
    expect(mapping.echoSbi('300000050')).toBe('300000050')
  })

  test('rejects two sources mapped to the same synthetic identifier', () => {
    expect(
      () => new IdMapping({ sbi: '100000001:300000001,100000002:300000001' })
    ).toThrow('mapped from more than one source')
  })

  test('validates SBI entries against the SBI ranges', () => {
    expect(() => new IdMapping({ sbi: '100000001:1300000001' })).toThrow(
      'Invalid SBI mapping entry'
    )
  })
})
