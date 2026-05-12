"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.authorize = authorize;
exports.requireActiveUser = requireActiveUser;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../lib/prisma");
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Token manquant ou invalide' });
        return;
    }
    const token = authHeader.slice(7);
    try {
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        next();
    }
    catch {
        res.status(401).json({ error: 'Token expiré ou invalide' });
    }
}
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        if (roles.length && !roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Accès refusé — permissions insuffisantes' });
            return;
        }
        next();
    };
}
// Vérifie que l'utilisateur existe et est actif (optionnel, pour les routes sensibles)
async function requireActiveUser(req, res, next) {
    if (!req.user) {
        res.status(401).json({ error: 'Non authentifié' });
        return;
    }
    const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user || !user.isActive) {
        res.status(401).json({ error: 'Compte désactivé ou introuvable' });
        return;
    }
    next();
}
//# sourceMappingURL=auth.middleware.js.map