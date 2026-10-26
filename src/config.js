import path from 'node:path'
import { fileURLToPath } from 'node:url'

import convict from 'convict'
import convictFormatWithValidator from 'convict-format-with-validator'

convict.addFormats(convictFormatWithValidator)

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

export const config = convict({
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  host: {
    doc: 'The IP address to bind',
    format: 'ipaddress',
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind. 3008 is the port consumers expect the DAL stub on in their local stacks.',
    format: 'port',
    default: 3008,
    env: 'PORT'
  },
  serviceName: {
    doc: 'Api Service Name',
    format: String,
    default: 'grants-platform-dal-stub'
  },
  cdpEnvironment: {
    doc: 'The CDP environment the app is running in. With the addition of "local" for local development',
    format: [
      'local',
      'infra-dev',
      'management',
      'dev',
      'test',
      'perf-test',
      'ext-test',
      'prod'
    ],
    default: 'local',
    env: 'ENVIRONMENT'
  },
  log: {
    isEnabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: !isTest,
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : ['req', 'res', 'responseTime']
    }
  },
  data: {
    path: {
      doc: 'Directory holding the synthetic fixture collections (businesses/, customers/, relationships/)',
      format: String,
      default: path.join(repoRoot, 'data'),
      env: 'DATA_PATH'
    }
  },
  idMapping: {
    crn: {
      doc: 'CRN mapping, "from:to,from:to", resolving sign-in CRNs the fixtures do not contain to synthetic ones. Set only in environment configuration, never in this repository.',
      format: String,
      default: '',
      env: 'CRN_MAP',
      sensitive: true
    },
    sbi: {
      doc: 'SBI mapping, "from:to,from:to", resolving sign-in SBIs the fixtures do not contain to synthetic ones. Set only in environment configuration, never in this repository.',
      format: String,
      default: '',
      env: 'SBI_MAP',
      sensitive: true
    }
  },
  tracing: {
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  }
})

config.validate({ allowed: 'strict' })
