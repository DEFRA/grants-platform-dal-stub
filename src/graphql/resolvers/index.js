import { Business, BusinessCustomer, BusinessLand } from './business.js'
import { Customer, CustomerBusiness } from './customer.js'
import { Query } from './query.js'

/**
 * Resolver map keyed by GraphQL type. Parent objects carry the synthetic
 * identifiers used for fixture lookup. An identifier the request supplied is
 * kept on the object it fetched (`requestedSbi` / `requestedCrn`) and echoed
 * back as supplied; any other identifier field returns the unique mapped
 * source if there is one, otherwise the synthetic value.
 */
export const resolvers = {
  Query,
  Business,
  BusinessLand,
  BusinessCustomer,
  Customer,
  CustomerBusiness
}
