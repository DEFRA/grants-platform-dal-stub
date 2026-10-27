import { GraphQLError } from 'graphql'

const HTTP_NOT_FOUND = 404

// Same shape as fcp-dal-api app/errors/graphql.js: the code is the HTTP status
// text upper-cased, and extensions.http sets the response status.
export class NotFound extends GraphQLError {
  constructor(message, options) {
    super(message, options)
    this.extensions.code = 'NOT FOUND'
    this.extensions.http = { status: HTTP_NOT_FOUND }
  }
}

// What the DAL's @validateVariable directive throws from inside the resolver:
// BAD_USER_INPUT, and therefore the usual HTTP 200.
export class BadUserInput extends GraphQLError {
  constructor(message, options) {
    super(message, options)
    this.extensions.code = 'BAD_USER_INPUT'
  }
}
