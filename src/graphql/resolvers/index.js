import { Business, BusinessCustomer, BusinessLand } from './business.js'
import { Customer, CustomerBusiness } from './customer.js'
import { Query } from './query.js'

/**
 * Resolver map keyed by GraphQL type. Parent objects passed between resolvers
 * carry the synthetic identifiers used for fixture lookup; identifiers are
 * translated back to whatever the caller asked for only at the leaf fields
 * (`Business.sbi`, `Customer.crn`, `CustomerBusiness.sbi`, `BusinessCustomer.crn`).
 */
export const resolvers = {
  Query,
  Business,
  BusinessLand,
  BusinessCustomer,
  Customer,
  CustomerBusiness
}
