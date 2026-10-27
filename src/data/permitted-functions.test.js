import permissionGroups from './static/permission-groups.json' with { type: 'json' }

import {
  grantedBy,
  isPermitted,
  permittedFunctionNames
} from './permitted-functions.js'

describe('permitted functions', () => {
  test('every documented function is granted by a level that exists in the reference data', () => {
    for (const name of permittedFunctionNames) {
      const [groupId, level] = grantedBy(name)
      const group = permissionGroups.find(
        (candidate) => candidate.id === groupId
      )
      expect(group, name).toBeDefined()
      expect(
        group.permissions.map((p) => p.level),
        name
      ).toContain(level)
    }
  })

  test('a level grants its own functions and those of lower levels, not higher ones', () => {
    const held = [{ id: 'BUSINESS_DETAILS', level: 'AMEND' }]

    expect(isPermitted('viewBusinessDetails', held)).toBe(true)
    expect(isPermitted('amendBusinessDetails', held)).toBe(true)
    expect(isPermitted('amendBankAccountDetails', held)).toBe(false)
    expect(isPermitted('closeBusiness', held)).toBe(false)
  })

  test('only the matching group counts', () => {
    const held = [{ id: 'LAND_DETAILS', level: 'AMEND' }]

    expect(isPermitted('viewLand', held)).toBe(true)
    expect(isPermitted('viewBusinessDetails', held)).toBe(false)
  })

  test('NO_ACCESS, an unknown level and no groups grant nothing', () => {
    expect(
      isPermitted('viewLand', [{ id: 'LAND_DETAILS', level: 'NO_ACCESS' }])
    ).toBe(false)
    expect(
      isPermitted('viewLand', [{ id: 'LAND_DETAILS', level: 'MADE_UP' }])
    ).toBe(false)
    expect(isPermitted('viewLand', [])).toBe(false)
  })

  test('names the DAL does not document, including descriptive function text, are not permitted', () => {
    const held = [
      { id: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS', level: 'SUBMIT' }
    ]

    expect(isPermitted('submitApplication', held)).toBe(true)
    expect(isPermitted('Submit CS Application', held)).toBe(false)
    expect(isPermitted('constructor', held)).toBe(false)
    expect(grantedBy('toString')).toBeNull()
  })
})
