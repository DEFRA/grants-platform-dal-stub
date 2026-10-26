import permissionGroups from '../../data/static/permission-groups.json' with { type: 'json' }

import { NotFound } from '../errors.js'

export const Query = {
  business(_parent, { sbi }, { store, idMapping, logger }) {
    const syntheticSbi = idMapping.resolveSbi(sbi)
    const business = store.getBusiness(syntheticSbi)
    if (!business) {
      logger?.debug({ sbi: syntheticSbi }, 'Business not found')
      throw new NotFound('Business not found')
    }
    return business
  },

  customer(_parent, { crn }, { store, idMapping, logger }) {
    const syntheticCrn = idMapping.resolveCrn(crn)
    const customer = store.getCustomer(syntheticCrn)
    if (!customer) {
      logger?.debug({ crn: syntheticCrn }, 'Customer not found')
      throw new NotFound('Customer not found')
    }
    return customer
  },

  permissionGroups() {
    return permissionGroups
  }
}
