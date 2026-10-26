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

  test('outside production the whole request and response are dropped', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.resetModules()
    const { config } = await import('#/config.js')

    expect(config.get('log.redact')).toEqual(['req', 'res', 'responseTime'])
  })
})
