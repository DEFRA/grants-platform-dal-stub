import { Writable } from 'node:stream'

import pino from 'pino'

describe('production log redaction', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  test('the production redact list removes every request header from a logged request', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const { config } = await import('#/config.js')
    const paths = config.get('log.redact')
    expect(paths).toContain('req.headers')

    const lines = []
    const logger = pino(
      { redact: { paths, remove: true } },
      new Writable({
        write(chunk, _encoding, callback) {
          lines.push(chunk.toString())
          callback()
        }
      })
    )
    logger.info(
      {
        req: {
          method: 'POST',
          url: '/graphql',
          headers: {
            authorization: 'Bearer ENTRA-TOKEN',
            'x-forwarded-authorization': 'DEFRA-ID-JWT',
            email: 'user@example.test',
            'x-api-key': 'DEVELOPER-KEY'
          }
        },
        res: { statusCode: 200, headers: { 'set-cookie': 'session' } }
      },
      'request completed'
    )

    const output = lines.join('')
    expect(output).toContain('"method":"POST"')
    expect(output).toContain('"statusCode":200')
    for (const secret of [
      'ENTRA-TOKEN',
      'DEFRA-ID-JWT',
      'user@example.test',
      'DEVELOPER-KEY',
      'set-cookie',
      'headers'
    ]) {
      expect(output).not.toContain(secret)
    }
  })

  test('the request serializer drops the query string, so a GET /graphql cannot log identifiers', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const { loggerOptions } = await import('#/plugins/logger-options.js')

    const lines = []
    const logger = pino(
      { serializers: loggerOptions.serializers, redact: loggerOptions.redact },
      new Writable({
        write(chunk, _encoding, callback) {
          lines.push(chunk.toString())
          callback()
        }
      })
    )
    logger.info(
      {
        req: {
          method: 'get',
          path: '/graphql',
          url: new URL(
            'http://localhost:3008/graphql?query=%7B%20customer(crn%3A%20%221100000001%22)%20%7B%20crn%20%7D%20%7D'
          ),
          query: {
            query: '{ customer(crn: "1100000001") { crn } }',
            variables: '{"crn":"1100000001"}'
          },
          headers: { 'x-forwarded-authorization': 'DEFRA-ID-JWT' },
          info: { id: 'req-1', remoteAddress: '127.0.0.1' },
          raw: {}
        }
      },
      'request completed'
    )

    const output = lines.join('')
    expect(output).toContain('"url":"/graphql"')
    expect(output).toContain('"remoteAddress":"127.0.0.1"')
    expect(output).not.toContain('1100000001')
    expect(output).not.toContain('"query"')
    expect(output).not.toContain('DEFRA-ID-JWT')
  })

  test('outside production the whole request and response are dropped', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.resetModules()
    const { config } = await import('#/config.js')

    expect(config.get('log.redact')).toEqual(['req', 'res', 'responseTime'])
  })
})
