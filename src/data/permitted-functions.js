import permissionGroups from './static/permission-groups.json' with { type: 'json' }

// The external-user function names the DAL documents on business.permittedFunctions,
// each with the permission group level that grants it. The real DAL asks the Rural
// Payments authorisation service; this is the stub's reading of the permission groups.
const GRANTED_BY = {
  addOrRemoveOrTransferLand: ['LAND_DETAILS', 'AMEND'],
  addRoleOrPrivilege: ['BUSINESS_DETAILS', 'FULL_PERMISSION'],
  amendApplication: ['COUNTRYSIDE_STEWARDSHIP_APPLICATIONS', 'AMEND'],
  amendBankAccountDetails: ['BUSINESS_DETAILS', 'MAKE_LEGAL_CHANGES'],
  amendBusinessDetails: ['BUSINESS_DETAILS', 'AMEND'],
  amendControlledBusinessInfo: ['BUSINESS_DETAILS', 'MAKE_LEGAL_CHANGES'],
  amendELMApplications: ['ENVIRONMENTAL_LAND_MANAGEMENT_APPLICATIONS', 'AMEND'],
  amendEntitlements: ['ENTITLEMENTS', 'AMEND'],
  amendLegallyResponsiblePeople: ['BUSINESS_DETAILS', 'FULL_PERMISSION'],
  amendNewYoungFarmerProcess: ['BUSINESS_DETAILS', 'MAKE_LEGAL_CHANGES'],
  applyForBPS: ['BASIC_PAYMENT_SCHEME', 'SUBMIT'],
  closeBusiness: ['BUSINESS_DETAILS', 'FULL_PERMISSION'],
  confirmBusiness: ['BUSINESS_DETAILS', 'MAKE_LEGAL_CHANGES'],
  deleteBusiness: ['BUSINESS_DETAILS', 'FULL_PERMISSION'],
  modifyRoleOrPrivilege: ['BUSINESS_DETAILS', 'FULL_PERMISSION'],
  removeRoleOrPrivilege: ['BUSINESS_DETAILS', 'FULL_PERMISSION'],
  submitApplication: ['COUNTRYSIDE_STEWARDSHIP_APPLICATIONS', 'SUBMIT'],
  submitELMApplications: [
    'ENVIRONMENTAL_LAND_MANAGEMENT_APPLICATIONS',
    'SUBMIT'
  ],
  updateLandUse: ['LAND_DETAILS', 'AMEND'],
  viewApplication: ['COUNTRYSIDE_STEWARDSHIP_APPLICATIONS', 'VIEW'],
  viewBusinessBankAccount: ['BUSINESS_DETAILS', 'VIEW'],
  viewBusinessDetails: ['BUSINESS_DETAILS', 'VIEW'],
  viewCPH: ['BUSINESS_DETAILS', 'VIEW'],
  viewCSAgreements: ['COUNTRYSIDE_STEWARDSHIP_AGREEMENTS', 'VIEW'],
  viewCSApplications: ['COUNTRYSIDE_STEWARDSHIP_APPLICATIONS', 'VIEW'],
  viewCSClaims: ['COUNTRYSIDE_STEWARDSHIP_AGREEMENTS', 'VIEW'],
  viewCountrysideStewardship: ['COUNTRYSIDE_STEWARDSHIP_APPLICATIONS', 'VIEW'],
  viewELMApplications: ['ENVIRONMENTAL_LAND_MANAGEMENT_APPLICATIONS', 'VIEW'],
  viewEntitlements: ['ENTITLEMENTS', 'VIEW'],
  viewLand: ['LAND_DETAILS', 'VIEW'],
  viewLegallyResponsiblePeople: ['BUSINESS_DETAILS', 'VIEW']
}

// Levels in the order the reference data lists them, lowest first.
const LEVEL_RANK = new Map(
  permissionGroups.map((group) => [
    group.id,
    new Map(
      group.permissions.map((permission, rank) => [permission.level, rank])
    )
  ])
)

export const permittedFunctionNames = Object.keys(GRANTED_BY)

export function grantedBy(name) {
  return Object.hasOwn(GRANTED_BY, name) ? GRANTED_BY[name] : null
}

// True when any held permission group is at or above the level that grants the function.
export function isPermitted(name, heldGroups) {
  const granted = grantedBy(name)
  if (!granted) {
    return false
  }
  const [groupId, level] = granted
  const ranks = LEVEL_RANK.get(groupId)
  const required = ranks.get(level)
  return heldGroups.some(
    (group) =>
      group.id === groupId && (ranks.get(group.level) ?? -1) >= required
  )
}
