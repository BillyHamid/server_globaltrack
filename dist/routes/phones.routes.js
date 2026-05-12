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
const createPhoneSchema = zod_1.z.object({
    brand: zod_1.z.string().min(1),
    model: zod_1.z.string().min(1),
    capacity: zod_1.z.string().default(''),
    color: zod_1.z.string().default(''),
    sellingPrice: zod_1.z.number().positive('Prix de vente invalide'),
    purchasePrice: zod_1.z.number().nonnegative().optional().nullable(),
    imei: zod_1.z.string().regex(/^\d{15}$/, 'IMEI doit contenir 15 chiffres'),
    notes: zod_1.z.string().optional().default(''),
    photos: zod_1.z.array(zod_1.z.string()).optional().default([]),
});
const updatePhoneSchema = createPhoneSchema.partial().omit({ imei: true });
// GET /api/phones
router.get('/', async (req, res, next) => {
    try {
        const { brand, status, search, page = '1', limit = '50' } = req.query;
        const where = {};
        if (brand)
            where.brand = brand;
        if (status)
            where.status = status;
        if (search) {
            where.OR = [
                { model: { contains: search } },
                { imei: { contains: search } },
                { brand: { contains: search } },
            ];
        }
        const [phones, total] = await Promise.all([
            prisma_1.prisma.phone.findMany({
                where,
                include: { addedBy: { select: { id: true, name: true } } },
                orderBy: { addedAt: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
            }),
            prisma_1.prisma.phone.count({ where }),
        ]);
        res.json({
            data: phones.map(p => ({ ...p, photos: JSON.parse(p.photos) })),
            total,
            page: parseInt(page),
            limit: parseInt(limit),
        });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/phones/available
router.get('/available', async (_req, res, next) => {
    try {
        const phones = await prisma_1.prisma.phone.findMany({
            where: { status: 'disponible' },
            include: { addedBy: { select: { id: true, name: true } } },
            orderBy: { addedAt: 'desc' },
        });
        res.json(phones.map(p => ({ ...p, photos: JSON.parse(p.photos) })));
    }
    catch (err) {
        next(err);
    }
});
// GET /api/phones/stats
router.get('/stats', async (_req, res, next) => {
    try {
        const byBrand = await prisma_1.prisma.phone.groupBy({
            by: ['brand'],
            where: { status: 'disponible' },
            _count: { _all: true },
            orderBy: { _count: { brand: 'desc' } },
        });
        res.json(byBrand.map(b => ({ brand: b.brand, count: b._count._all })));
    }
    catch (err) {
        next(err);
    }
});
// GET /api/phones/:id
router.get('/:id', async (req, res, next) => {
    try {
        const phone = await prisma_1.prisma.phone.findUnique({
            where: { id: req.params.id },
            include: {
                addedBy: { select: { id: true, name: true } },
                movements: { include: { performedBy: { select: { id: true, name: true } } }, orderBy: { date: 'desc' } },
                sales: {
                    include: {
                        client: { select: { id: true, name: true, phone: true } },
                        payments: true,
                    },
                },
            },
        });
        if (!phone)
            throw new error_middleware_1.AppError(404, 'Téléphone introuvable');
        res.json({ ...phone, photos: JSON.parse(phone.photos) });
    }
    catch (err) {
        next(err);
    }
});
// POST /api/phones
router.post('/', (0, validate_middleware_1.validate)(createPhoneSchema), async (req, res, next) => {
    try {
        const data = req.body;
        // Vérifier unicité IMEI
        const existing = await prisma_1.prisma.phone.findUnique({ where: { imei: data.imei } });
        if (existing)
            throw new error_middleware_1.AppError(409, `L'IMEI ${data.imei} est déjà enregistré (téléphone #${existing.id})`);
        const { photos, purchasePrice, ...rest } = data;
        const phone = await prisma_1.prisma.phone.create({
            data: {
                ...rest,
                purchasePrice: purchasePrice ?? undefined,
                photos: JSON.stringify(photos),
                addedById: req.user.userId,
            },
            include: { addedBy: { select: { id: true, name: true } } },
        });
        // Créer le mouvement d'entrée
        await prisma_1.prisma.stockMovement.create({
            data: { type: 'entree', phoneId: phone.id, performedById: req.user.userId },
        });
        await (0, activity_service_1.logActivity)(req.user.userId, 'PHONE_ADDED', `${phone.brand} ${phone.model} ajouté au stock (IMEI: ${phone.imei}, prix: ${phone.sellingPrice.toLocaleString('fr-FR')} FC)`);
        res.status(201).json({ ...phone, photos: JSON.parse(phone.photos) });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /api/phones/:id
router.patch('/:id', (0, validate_middleware_1.validate)(updatePhoneSchema), async (req, res, next) => {
    try {
        const data = req.body;
        const updateData = { ...data };
        if (data.photos)
            updateData.photos = JSON.stringify(data.photos);
        const phone = await prisma_1.prisma.phone.update({
            where: { id: req.params.id },
            data: updateData,
            include: { addedBy: { select: { id: true, name: true } } },
        });
        await (0, activity_service_1.logActivity)(req.user.userId, 'PHONE_UPDATED', `${phone.brand} ${phone.model} modifié`);
        res.json({ ...phone, photos: JSON.parse(phone.photos) });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /api/phones/:id  (admin/gestionnaire uniquement, uniquement si disponible + pas de vente)
router.delete('/:id', (0, auth_middleware_1.authorize)('admin', 'gestionnaire'), async (req, res, next) => {
    try {
        const phone = await prisma_1.prisma.phone.findUnique({ where: { id: req.params.id } });
        if (!phone)
            throw new error_middleware_1.AppError(404, 'Téléphone introuvable');
        if (phone.status !== 'disponible') {
            throw new error_middleware_1.AppError(400, 'Impossible de supprimer un téléphone vendu ou en crédit');
        }
        const hasSales = await prisma_1.prisma.sale.count({ where: { phoneId: phone.id } });
        if (hasSales > 0) {
            throw new error_middleware_1.AppError(400, 'Impossible de supprimer un téléphone lié à des ventes');
        }
        await prisma_1.prisma.stockMovement.deleteMany({ where: { phoneId: phone.id } });
        await prisma_1.prisma.phone.delete({ where: { id: phone.id } });
        await (0, activity_service_1.logActivity)(req.user.userId, 'PHONE_DELETED', `${phone.brand} ${phone.model} supprimé (IMEI: ${phone.imei})`);
        res.json({ message: 'Téléphone supprimé avec succès' });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=phones.routes.js.map