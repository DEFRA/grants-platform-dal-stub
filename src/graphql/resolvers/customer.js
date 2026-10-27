import { validSbi } from '../identifiers.js'

/**
 * `parent` is a customer fixture document: the `Customer` GraphQL type stored
 * as-is under data/customers/<crn>.json. Businesses the customer can act for
 * come from relationship documents, with the business name taken from the
 * business fixture so there is a single source of truth.
 */
export const Customer = {
  // Echo what the request asked for; otherwise the unique mapped source, if any.
  crn({ crn, requestedCrn }, _args, { idMapping }) {
    return requestedCrn ?? idMapping.echoCrn(crn)
  },

  personId({ personId, crn }) {
    return personId ?? crn
  },

  businesses({ crn }, _args, { store }) {
    return store
      .getRelationshipsForCustomer(crn)
      .map((relationship) => toCustomerBusiness(relationship, store))
  },

  // The real DAL returns null, not an error, when the customer has no
  // relationship with the requested business.
  business({ crn }, { sbi }, { store, idMapping }) {
    const requestedSbi = validSbi(sbi)
    const relationship = store.getRelationship(
      idMapping.resolveSbi(requestedSbi),
      crn
    )
    return relationship
      ? { ...toCustomerBusiness(relationship, store), requestedSbi }
      : null
  },

  authenticationQuestions({ authenticationQuestions }) {
    return authenticationQuestions ?? null
  }
}

export const CustomerBusiness = {
  sbi({ sbi, requestedSbi }, _args, { idMapping }) {
    return requestedSbi ?? idMapping.echoSbi(sbi)
  },

  // Like the real DAL: messages on or after fromDate when given, otherwise all.
  messages({ messages }, { fromDate }) {
    const all = messages ?? []
    if (!fromDate) {
      return all
    }
    const from = new Date(fromDate)
    return all.filter((message) => new Date(message.date) >= from)
  }
}

function toCustomerBusiness(relationship, store) {
  const business = store.getBusiness(relationship.sbi)
  return {
    organisationId: business?.organisationId ?? null,
    sbi: relationship.sbi,
    name: business?.info?.name ?? '',
    role: relationship.role ?? null,
    permissionGroups: relationship.permissionGroups,
    messages: relationship.messages
  }
}
