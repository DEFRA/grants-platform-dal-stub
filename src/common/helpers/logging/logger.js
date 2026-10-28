import { pino } from 'pino'

import { loggerOptions, loggerStream } from '../../../plugins/logger-options.js'

const logger = pino(loggerOptions, loggerStream)

export function createLogger() {
  return logger
}
