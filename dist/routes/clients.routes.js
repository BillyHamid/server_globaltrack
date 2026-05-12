"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const activity_service_1 = require("../services/activity.service");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const emptyToString = (v) => (v == null || v === '' ? '' : String(v).trim());
const clientSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nom trop court').max(200).transform(s => s.trim()),
    phone: zod_1.z.string().min(6, 'Numéro trop court').max(40).transform(s => s.trim()),
    email: zod_1.z.preprocess(emptyToString, zod_1.z.union([zod_1.z.literal(''), zod_1.z.string().email('Email invalide')])),
    address: zod_1.z.preprocess(emptyToString, zod_1.z.string().max(500)),
});
// GET /api/clients
router.get('/', async (req, res, next) => {
    try {
        const { search } = req.query;
        const where = search
            ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }, { email: { contains: search } }] }
            : {};
        const clients = await prisma_1.prisma.client.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
        // Calculer la dette réelle
        const clientsWithDebt = await Promise.all(clients.map(async (c) => {
            const debt = await prisma_1.prisma.sale.aggregate({
                where: { clientId: c.id, type: 'credit', paymentStatus: { not: 'paye' } },
                _sum: { remainingAmount: true },
            });
            return { ...c, totalDebt: debt._sum.remainingAmount ?? 0 };
        }));
        res.json(clientsWithDebt);
    }
    catch (err) {
        next(err);
    }
});
// GET /api/clients/:id
router.get('/:id', async (req, res, next) => {
    try {
        const client = await prisma_1.prisma.client.findUnique({ where: { id: req.params.id } });
        if (!client)
            throw new error_middleware_1.AppError(404, 'Client introuvable');
        const [sales, debt] = await Promise.all([
            prisma_1.prisma.sale.findMany({
                where: { clientId: client.id },
                include: {
                    phone: { select: { id: true, brand: true, model: true, imei: true } },
                    payments: true,
                    seller: { select: { id: true, name: true } },
                },
                orderBy: { date: 'desc' },
            }),
            prisma_1.prisma.sale.aggregate({
                where: { clientId: client.id, type: 'credit', paymentStatus: { not: 'paye' } },
                _sum: { remainingAmount: true },
            }),
        ]);
        res.json({ ...client, totalDebt: debt._sum.remainingAmount ?? 0, sales });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/clients/:id/debt
router.get('/:id/debt', async (req, res, next) => {
    try {
        const result = await prisma_1.prisma.sale.aggregate({
            where: { clientId: req.params.id, type: 'credit', paymentStatus: { not: 'paye' } },
            _sum: { remainingAmount: true },
        });
        res.json({ totalDebt: result._sum.remainingAmount ?? 0 });
    }
    catch (err) {
        next(err);
    }
});
// POST /api/clients
router.post('/', (0, validate_middleware_1.validate)(clientSchema), async (req, res, next) => {
    try {
        const client = await prisma_1.prisma.client.create({ data: req.body });
        await (0, activity_service_1.logActivity)(req.user.userId, 'CLIENT_ADDED', `Nouveau client : ${client.name} (${client.phone})`);
        res.status(201).json({ ...client, totalDebt: 0 });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /api/clients/:id
router.patch('/:id', (0, validate_middleware_1.validate)(clientSchema.partial()), async (req, res, next) => {
    try {
        const client = await prisma_1.prisma.client.update({ where: { id: req.params.id }, data: req.body });
        await (0, activity_service_1.logActivity)(req.user.userId, 'CLIENT_UPDATED', `Client modifié : ${client.name}`);
        res.json(client);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=clients.routes.js.map