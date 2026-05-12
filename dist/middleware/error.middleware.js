"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const logger_1 = require("../lib/logger");
class AppError extends Error {
    statusCode;
    code;
    constructor(statusCode, message, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = 'AppError';
    }
}
exports.AppError = AppError;
function errorHandler(err, _req, res, _next) {
    // Erreurs de validation Zod
    if (err instanceof zod_1.ZodError) {
        res.status(400).json({
            error: 'Données invalides',
            details: err.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
        });
        return;
    }
    // Erreurs applicatives connues
    if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
    }
    // Erreur Prisma — clé unique violée
    if (err.code === 'P2002') {
        res.status(409).json({ error: 'Un enregistrement avec ces données existe déjà' });
        return;
    }
    // Erreur Prisma — enregistrement introuvable
    if (err.code === 'P2025') {
        res.status(404).json({ error: 'Enregistrement introuvable' });
        return;
    }
    // Erreur interne non gérée
    logger_1.logger.error(`Unhandled error: ${err.message}\n${err.stack ?? ''}`);
    res.status(500).json({ error: 'Erreur serveur interne' });
}
//# sourceMappingURL=error.middleware.js.map