"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = require("express-rate-limit");
const logger_1 = require("./lib/logger");
const error_middleware_1 = require("./middleware/error.middleware");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const phones_routes_1 = __importDefault(require("./routes/phones.routes"));
const clients_routes_1 = __importDefault(require("./routes/clients.routes"));
const sales_routes_1 = __importDefault(require("./routes/sales.routes"));
const users_routes_1 = __importDefault(require("./routes/users.routes"));
const imei_routes_1 = __importDefault(require("./routes/imei.routes"));
const apple_routes_1 = __importDefault(require("./routes/apple.routes"));
const alerts_routes_1 = __importDefault(require("./routes/alerts.routes"));
const movements_routes_1 = __importDefault(require("./routes/movements.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const tac_routes_1 = __importDefault(require("./routes/tac.routes"));
const sorties_routes_1 = __importDefault(require("./routes/sorties.routes"));
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
// ─── Sécurité ─────────────────────────────────────────────────────────────────
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5174',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
// ─── Rate limiting ────────────────────────────────────────────────────────────
app.use('/api', (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de requêtes, réessayez dans quelques minutes' },
}));
// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express_1.default.json({ limit: '12mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// ─── HTTP Logging ─────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
    app.use((0, morgan_1.default)('dev', { stream: { write: msg => logger_1.logger.http(msg.trim()) } }));
}
// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', auth_routes_1.default);
app.use('/api/phones', phones_routes_1.default);
app.use('/api/clients', clients_routes_1.default);
app.use('/api/sales', sales_routes_1.default);
app.use('/api/users', users_routes_1.default);
app.use('/api/imei', imei_routes_1.default);
app.use('/api/apple', apple_routes_1.default);
app.use('/api/alerts', alerts_routes_1.default);
app.use('/api/movements', movements_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.use('/api/tac', tac_routes_1.default);
app.use('/api/sorties', sorties_routes_1.default);
// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});
// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: 'Route introuvable' });
});
// ─── Error handler (doit être en dernier) ─────────────────────────────────────
app.use(error_middleware_1.errorHandler);
// ─── Démarrage ────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
    logger_1.logger.info(`╔══════════════════════════════════════════╗`);
    logger_1.logger.info(`║   GlobalTrack API  •  port ${PORT}           ║`);
    logger_1.logger.info(`║   ENV: ${process.env.NODE_ENV ?? 'development'}                     ║`);
    logger_1.logger.info(`╚══════════════════════════════════════════╝`);
});
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        logger_1.logger.error(`Impossible d'écouter le port ${PORT} : déjà utilisé (EADDRINUSE). ` +
            `Arrêtez l'autre instance du backend ou le processus qui occupe ce port, ` +
            `ou définissez PORT=3002 dans backend/.env puis relancez.`);
        process.exit(1);
    }
    throw err;
});
exports.default = app;
//# sourceMappingURL=index.js.map