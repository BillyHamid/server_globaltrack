"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const LEVELS = { error: 0, warn: 1, info: 2, http: 3, debug: 4 };
const COLORS = {
    error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[32m', http: '\x1b[35m', debug: '\x1b[36m',
};
const RESET = '\x1b[0m';
const currentLevel = (process.env.LOG_LEVEL ?? 'info');
function log(level, message) {
    if (LEVELS[level] > LEVELS[currentLevel])
        return;
    const time = new Date().toISOString();
    const color = COLORS[level];
    console.log(`${color}[${time}] [${level.toUpperCase()}]${RESET} ${message}`);
}
exports.logger = {
    error: (msg) => log('error', msg),
    warn: (msg) => log('warn', msg),
    info: (msg) => log('info', msg),
    http: (msg) => log('http', msg),
    debug: (msg) => log('debug', msg),
};
//# sourceMappingURL=logger.js.map