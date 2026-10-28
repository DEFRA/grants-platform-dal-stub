import { ApolloServer } from '@apollo/server'
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled'
import hapiApolloModule from '@as-integrations/hapi'

import { loadTypeDefs } from '../graphql/schema.js'
import { resolvers } from '../graphql/resolvers/index.js'

// CommonJS package: under Node the default import is the module object whose
// `default` property is the plugin; under vitest's interop it is already the plugin.
const hapiApollo = hapiApolloModule.default ?? hapiApolloModule

/**
 * Serves the DAL schema at POST /graphql, the same path as the real DAL, so a
 * consumer switches between the two by changing only the endpoint URL. No
 * authentication is enforced: Authorization and Defra ID headers are accepted
 * and ignored.
 */
export const graphql = {
  plugin: {
    name: 'graphql',
    register: async (server, { store, idMapping }) => {
      const apollo = new ApolloServer({
        typeDefs: await loadTypeDefs(),
        resolvers,
        introspection: true,
        includeStacktraceInErrorResponses: false,
        plugins: [ApolloServerPluginLandingPageDisabled()]
      })
      await apollo.start()

      server.events.on('stop', () => apollo.stop())

      await server.register({
        plugin: hapiApollo,
        options: {
          apolloServer: apollo,
          path: '/graphql',
          context: async ({ request }) => ({
            store,
            idMapping,
            logger: request.logger
          })
        }
      })
    }
  }
}
