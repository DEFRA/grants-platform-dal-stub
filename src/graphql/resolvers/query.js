import permissionGroups from '../../data/static/permission-groups.json' with { type: 'json' }

import { isSyntheticCrn, isSyntheticSbi } from '../../data/synthetic-ranges.js'
import { NotFound } from '../errors.js'
import { validCrn, validSbi } from '../identifiers.js'

export const Query = {
  business(_parent, { sbi }, { store, idMapping, logger }) {
    const requestedSbi = validSbi(sbi)
    const syntheticSbi = idMapping.resolveSbi(requestedSbi)
    const business = store.getBusiness(syntheticSbi)
    if (!business) {
      logger?.debug(
        { sbi: loggable(syntheticSbi, isSyntheticSbi) },
        'Business not found'
      )
      throw new NotFound('Business not found')
    }
    return { ...business, requestedSbi }
  },

  customer(_parent, { crn }, { store, idMapping, logger }) {
    const requestedCrn = validCrn(crn)
    const syntheticCrn = idMapping.resolveCrn(requestedCrn)
    const customer = store.getCustomer(syntheticCrn)
    if (!customer) {
      logger?.debug(
        { crn: loggable(syntheticCrn, isSyntheticCrn) },
        'Customer not found'
      )
      throw new NotFound('Customer not found')
    }
    return { ...customer, requestedCrn }
  },

  permissionGroups() {
    return permissionGroups
  }
}

// Never log an identifier that might be an issued one.
function loggable(identifier, isSynthetic) {
  return isSynthetic(identifier) ? identifier : '[not synthetic]'
}
