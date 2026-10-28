import { ecsFormat } from '@elastic/ecs-pino-format'
import { stdSerializers } from 'pino'
import pretty from 'pino-pretty'
import { config } from '#/config.js'
import { getTraceId } from '@defra/hapi-tracing'

const logConfig = config.get('log')
const serviceName = config.get('serviceName')
const serviceVersion = config.get('serviceVersion')

const formatters = {
  ecs: {
    ...ecsFormat({
      serviceVersion,
      serviceName
    })
  },
  'pino-pretty': {}
}

// pino's transport runs pino-pretty in a worker thread, which node --watch breaks
// by posting its own messages to the worker; pretty-print in-process instead.
export const loggerStream =
  logConfig.format === 'pino-pretty' ? pretty() : process.stdout

export const loggerOptions = {
  enabled: logConfig.isEnabled,
  ignorePaths: ['/health'],
  redact: {
    paths: logConfig.redact,
    remove: true
  },
  level: logConfig.level,
  ...formatters[logConfig.format],
  nesting: true,
  // GET /graphql carries the query and variables in the URL; never log them.
  wrapSerializers: false,
  serializers: {
    req(request) {
      const { query, ...rest } = stdSerializers.req(request)
      return rest
    }
  },
  mixin() {
    const mixinValues = {}
    const traceId = getTraceId()
    if (traceId) {
      mixinValues.trace = { id: traceId }
    }
    return mixinValues
  }
}
