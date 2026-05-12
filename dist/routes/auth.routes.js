"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const validate_middleware_1 = require("../middleware/validate.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const activity_service_1 = require("../services/activity.service");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Email invalide'),
    password: zod_1.z.string().min(1, 'Mot de passe requis'),
});
function signTokens(userId, email, role) {
    const payload = { userId, email, role };
    const accessToken = jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    });
    const refreshToken = jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
    });
    return { accessToken, refreshToken };
}
// POST /api/auth/login
router.post('/login', (0, validate_middleware_1.validate)(loginSchema), async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) {
            throw new error_middleware_1.AppError(401, 'Email ou mot de passe incorrect');
        }
        const match = await bcryptjs_1.default.compare(password, user.password);
        if (!match)
            throw new error_middleware_1.AppError(401, 'Email ou mot de passe incorrect');
        const { accessToken, refreshToken } = signTokens(user.id, user.email, user.role);
        // Stocker le refresh token
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await prisma_1.prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } });
        await (0, activity_service_1.logActivity)(user.id, 'LOGIN', `Connexion depuis ${req.ip}`);
        res.json({
            accessToken,
            refreshToken,
            user: {
                id: user.id, name: user.name, email: user.email,
                role: user.role, phone: user.phone, avatar: user.avatar, isActive: user.isActive,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken)
            throw new error_middleware_1.AppError(400, 'Refresh token manquant');
        const stored = await prisma_1.prisma.refreshToken.findUnique({ where: { token: refreshToken } });
        if (!stored || stored.expiresAt < new Date()) {
            throw new error_middleware_1.AppError(401, 'Refresh token invalide ou expiré');
        }
        const payload = jsonwebtoken_1.default.verify(refreshToken, process.env.JWT_SECRET);
        const { accessToken, refreshToken: newRefresh } = signTokens(payload.userId, payload.email, payload.role);
        // Rotation du refresh token
        await prisma_1.prisma.refreshToken.delete({ where: { token: refreshToken } });
        await prisma_1.prisma.refreshToken.create({
            data: { token: newRefresh, userId: payload.userId, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        });
        res.json({ accessToken, refreshToken: newRefresh });
    }
    catch (err) {
        next(err);
    }
});
// POST /api/auth/logout
router.post('/logout', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (refreshToken) {
            await prisma_1.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
        }
        res.json({ message: 'Déconnecté avec succès' });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/auth/me
router.get('/me', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { id: true, name: true, email: true, role: true, phone: true, avatar: true, isActive: true, createdAt: true },
        });
        if (!user)
            throw new error_middleware_1.AppError(404, 'Utilisateur introuvable');
        res.json(user);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map