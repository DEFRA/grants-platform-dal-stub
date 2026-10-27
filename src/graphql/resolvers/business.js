import { isPermitted } from '#/data/permitted-functions.js'
import { NotFound } from '../errors.js'
import { validCrn } from '../identifiers.js'

/**
 * `parent` is a business fixture document: the `Business` GraphQL type stored
 * as-is under data/businesses/<sbi>.json. Relationship documents supply the
 * per-customer role and permission groups.
 */
export const Business = {
  // Echo what the request asked for; otherwise the unique mapped source, if any.
  sbi({ sbi, requestedSbi }, _args, { idMapping }) {
    return requestedSbi ?? idMapping.echoSbi(sbi)
  },

  land(business) {
    return { business, land: business.land ?? {} }
  },

  countyParishHoldings({ countyParishHoldings }) {
    return countyParishHoldings ?? []
  },

  agreements({ agreements }) {
    return agreements ?? []
  },

  applications({ applications }) {
    return applications ?? []
  },

  // The real DAL answers this for the signed-in user. The stub has no user
  // context, so a function is permitted when any customer of the business holds
  // the permission level that grants it (src/data/permitted-functions.js).
  permittedFunctions({ sbi }, { functions }, { store }) {
    const held = store
      .getRelationshipsForBusiness(sbi)
      .flatMap((relationship) => relationship.permissionGroups)
    return functions.map((name) => ({
      name,
      permitted: isPermitted(name, held)
    }))
  },

  customers({ sbi }, _args, { store }) {
    return store
      .getRelationshipsForBusiness(sbi)
      .map((relationship) => toBusinessCustomer(relationship, store))
  },

  customer({ sbi }, { crn }, { store, idMapping }) {
    const requestedCrn = validCrn(crn)
    const relationship = store.getRelationship(
      sbi,
      idMapping.resolveCrn(requestedCrn)
    )
    if (!relationship) {
      throw new NotFound('Customer not found')
    }
    return { ...toBusinessCustomer(relationship, store), requestedCrn }
  }
}

export const BusinessCustomer = {
  crn({ crn, requestedCrn }, _args, { idMapping }) {
    return requestedCrn ?? idMapping.echoCrn(crn)
  }
}

/**
 * Land fixtures hold the parcels current today. The `date` argument is accepted
 * for compatibility with the real DAL and ignored, so every date returns the same
 * parcels. Covers and land uses are optional per-parcel arrays in the fixture.
 */
export const BusinessLand = {
  parcels({ land }) {
    return (land.parcels ?? []).map(toParcel)
  },

  parcel({ land }, { sheetId, parcelId }) {
    return toParcel(findParcel(land, sheetId, parcelId))
  },

  parcelCovers({ land }, { sheetId, parcelId }) {
    return findParcel(land, sheetId, parcelId).covers ?? []
  },

  parcelLandUses({ land }, { sheetId, parcelId }) {
    return findParcel(land, sheetId, parcelId).landUses ?? []
  },

  summary({ land }) {
    const parcels = land.parcels ?? []
    const areas = parcels.map((parcel) => parcel.area)
    return {
      totalParcels: parcels.length,
      // Unknown, not zero, when any parcel has no area.
      totalArea: areas.every((area) => typeof area === 'number')
        ? round(areas.reduce((sum, area) => sum + area, 0))
        : null,
      arableLandArea: null,
      permanentCropsArea: null,
      permanentGrasslandArea: null,
      ...land.summary
    }
  }
}

function findParcel(land, sheetId, parcelId) {
  const parcel = (land.parcels ?? []).find(
    (candidate) =>
      candidate.sheetId === sheetId && candidate.parcelId === parcelId
  )
  if (!parcel) {
    throw new NotFound(
      `No parcel found for sheetId: ${sheetId} and parcelId: ${parcelId}`
    )
  }
  return parcel
}

function toParcel(parcel) {
  // The upstream schema marks `id` as non-null; fixtures may omit it.
  const { covers, landUses, ...rest } = parcel
  return { id: `${parcel.sheetId}-${parcel.parcelId}`, ...rest }
}

function toBusinessCustomer(relationship, store) {
  const customer = store.getCustomer(relationship.crn)
  return {
    personId: customer?.personId ?? null,
    firstName: customer?.info?.name?.first ?? null,
    lastName: customer?.info?.name?.last ?? null,
    crn: relationship.crn,
    role: relationship.role ?? null,
    permissionGroups: relationship.permissionGroups
  }
}

function round(value) {
  return Math.round(value * 10000) / 10000
}
