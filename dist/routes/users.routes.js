"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../lib/prisma");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const activity_service_1 = require("../services/activity.service");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const userSelectPublic = {
    id: true, name: true, email: true, role: true,
    phone: true, avatar: true, isActive: true, createdAt: true,
};
const createUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, 'Mot de passe trop court (min 8 caractères)'),
    role: zod_1.z.enum(['admin', 'vendeur', 'gestionnaire']),
    phone: zod_1.z.string().optional().default(''),
});
const updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    email: zod_1.z.string().email().optional(),
    role: zod_1.z.enum(['admin', 'vendeur', 'gestionnaire']).optional(),
    phone: zod_1.z.string().optional(),
    isActive: zod_1.z.boolean().optional(),
    password: zod_1.z.string().min(8).optional(),
});
// GET /api/users
router.get('/', (0, auth_middleware_1.authorize)('admin', 'gestionnaire'), async (_req, res, next) => {
    try {
        const users = await prisma_1.prisma.user.findMany({
            select: userSelectPublic,
            orderBy: { createdAt: 'asc' },
        });
        res.json(users);
    }
    catch (err) {
        next(err);
    }
});
// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
    try {
        // Seul l'admin ou l'utilisateur lui-même peut voir le profil complet
        if (req.user.role !== 'admin' && req.user.userId !== req.params.id) {
            throw new error_middleware_1.AppError(403, 'Accès refusé');
        }
        const user = await prisma_1.prisma.user.findUnique({ where: { id: req.params.id }, select: userSelectPublic });
        if (!user)
            throw new error_middleware_1.AppError(404, 'Utilisateur introuvable');
        const [salesCount, activityCount] = await Promise.all([
            prisma_1.prisma.sale.count({ where: { sellerId: user.id } }),
            prisma_1.prisma.activityLog.count({ where: { userId: user.id } }),
        ]);
        res.json({ ...user, salesCount, activityCount });
    }
    catch (err) {
        next(err);
    }
});
// POST /api/users  (admin uniquement)
router.post('/', (0, auth_middleware_1.authorize)('admin'), (0, validate_middleware_1.validate)(createUserSchema), async (req, res, next) => {
    try {
        const body = req.body;
        const hashed = await bcryptjs_1.default.hash(body.password, 10);
        const user = await prisma_1.prisma.user.create({
            data: { ...body, password: hashed },
            select: userSelectPublic,
        });
        await (0, activity_service_1.logActivity)(req.user.userId, 'USER_CREATED', `Nouvel utilisateur : ${user.name} (${user.role})`);
        res.status(201).json(user);
    }
    catch (err) {
        next(err);
    }
});
// PATCH /api/users/:id  (admin ou soi-même)
router.patch('/:id', (0, validate_middleware_1.validate)(updateUserSchema), async (req, res, next) => {
    try {
        if (req.user.role !== 'admin' && req.user.userId !== req.params.id) {
            throw new error_middleware_1.AppError(403, 'Accès refusé');
        }
        const body = req.body;
        const updateData = { ...body };
        if (body.password)
            updateData.password = await bcryptjs_1.default.hash(body.password, 10);
        const user = await prisma_1.prisma.user.update({
            where: { id: req.params.id },
            data: updateData,
            select: userSelectPublic,
        });
        await (0, activity_service_1.logActivity)(req.user.userId, 'USER_UPDATED', `Utilisateur modifié : ${user.name}`);
        res.json(user);
    }
    catch (err) {
        next(err);
    }
});
// GET /api/users/:id/activity
router.get('/:id/activity', async (req, res, next) => {
    try {
        const logs = await prisma_1.prisma.activityLog.findMany({
            where: { userId: req.params.id },
            orderBy: { timestamp: 'desc' },
            take: 50,
        });
        res.json(logs);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=users.routes.js.map