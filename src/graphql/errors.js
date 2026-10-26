import { GraphQLError } from 'graphql'

/**
 * Mirrors fcp-dal-api `app/errors/graphql.js`: the real DAL reports failures
 * through the GraphQL `errors` array with an `extensions.code` matching the
 * HTTP status text, and Apollo uses `extensions.http.status` for the HTTP
 * status of the response.
 */
export class NotFound extends GraphQLError {
  constructor(message, options) {
    super(message, options)
    this.extensions.code = 'NOT_FOUND'
    this.extensions.http = { status: 404 }
  }
}

export class BadRequest extends GraphQLError {
  constructor(message, options) {
    super(message, options)
    this.extensions.code = 'BAD_REQUEST'
    this.extensions.http = { status: 400 }
  }
}
