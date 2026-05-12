type Level = 'error' | 'warn' | 'info' | 'http' | 'debug'

const LEVELS: Record<Level, number> = { error: 0, warn: 1, info: 2, http: 3, debug: 4 }
const COLORS: Record<Level, string> = {
  error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[32m', http: '\x1b[35m', debug: '\x1b[36m',
}
const RESET = '\x1b[0m'

const currentLevel = (process.env.LOG_LEVEL ?? 'info') as Level

function log(level: Level, message: string) {
  if (LEVELS[level] > LEVELS[currentLevel]) return
  const time = new Date().toISOString()
  const color = COLORS[level]
  console.log(`${color}[${time}] [${level.toUpperCase()}]${RESET} ${message}`)
}

export const logger = {
  error: (msg: string) => log('error', msg),
  warn:  (msg: string) => log('warn',  msg),
  info:  (msg: string) => log('info',  msg),
  http:  (msg: string) => log('http',  msg),
  debug: (msg: string) => log('debug', msg),
}
