"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const activity_service_1 = require("../services/activity.service");
const error_middleware_1 = require("../middleware/error.middleware");
const HOURS_48_MS = 48 * 60 * 60 * 1000;
const MAX_RETURN_PROOF_CHARS = 1_000_000;
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const createSortieSchema = zod_1.z.object({
    personName: zod_1.z.string().min(1, 'Nom requis').max(200),
    phoneId: zod_1.z.string().min(1),
    motif: zod_1.z.string().min(1, 'Motif requis').max(2000),
});
// GET /api/sorties — liste (en cours en premier)
router.get('/', async (_req, res, next) => {
    try {
        const list = await prisma_1.prisma.phoneExit.findMany({
            include: {
                phone: { include: { addedBy: { select: { id: true, name: true } } } },
                createdBy: { select: { id: true, name: true } },
            },
            orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        });
        res.json(list);
    }
    catch (err) {
        next(err);
    }
});
// POST /api/sorties — nouvelle sortie (48 h)
router.post('/', (0, validate_middleware_1.validate)(createSortieSchema), async (req, res, next) => {
    try {
        const { personName, phoneId, motif } = req.body;
        const phone = await prisma_1.prisma.phone.findUnique({ where: { id: phoneId } });
        if (!phone)
            throw new error_middleware_1.AppError(404, 'Téléphone introuvable');
        if (phone.status !== 'disponible') {
            throw new error_middleware_1.AppError(400, 'Ce téléphone n’est pas disponible pour une sortie');
        }
        const openExit = await prisma_1.prisma.phoneExit.findFirst({
            where: { phoneId, status: 'en_cours' },
        });
        if (openExit) {
            throw new error_middleware_1.AppError(409, 'Une sortie est déjà en cours pour ce téléphone');
        }
        const now = new Date();
        const dueAt = new Date(now.getTime() + HOURS_48_MS);
        const exit = await prisma_1.prisma.$transaction(async (tx) => {
            const created = await tx.phoneExit.create({
                data: {
                    personName,
                    motif,
                    phoneId,
                    dueAt,
                    createdById: req.user.userId,
                },
                include: {
                    phone: { include: { addedBy: { select: { id: true, name: true } } } },
                    createdBy: { select: { id: true, name: true } },
                },
            });
            await tx.phone.update({
                where: { id: phoneId },
                data: { status: 'sortie' },
            });
            await tx.stockMovement.create({
                data: {
                    type: 'sortie',
                    phoneId,
                    performedById: req.user.userId,
                    notes: `Sortie — ${personName} — ${motif.slice(0, 500)}`,
                },
            });
            return created;
        });
        await (0, activity_service_1.logActivity)(req.user.userId, 'SORTIE_CREATED', `Sortie : ${personName} — ${phone.brand} ${phone.model} (IMEI ${phone.imei}) — échéance ${dueAt.toISOString()}`);
        res.status(201).json(exit);
    }
    catch (err) {
        next(err);
    }
});
const returnSchema = zod_1.z.object({
    notes: zod_1.z.preprocess((v) => (v == null || v === '' ? '' : String(v)), zod_1.z.string().max(2000)),
    returnProof: zod_1.z.preprocess((v) => (v == null || v === '' ? '' : String(v)), zod_1.z.string().max(MAX_RETURN_PROOF_CHARS)),
});
// POST /api/sorties/:id/return — retour en magasin
router.post('/:id/return', (0, validate_middleware_1.validate)(returnSchema), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { notes, returnProof } = req.body;
        const exit = await prisma_1.prisma.phoneExit.findUnique({
            where: { id },
            include: { phone: true },
        });
        if (!exit)
            throw new error_middleware_1.AppError(404, 'Sortie introuvable');
        if (exit.status !== 'en_cours') {
            throw new error_middleware_1.AppError(400, 'Cette sortie est déjà clôturée');
        }
        const returnedAt = new Date();
        const updated = await prisma_1.prisma.$transaction(async (tx) => {
            const u = await tx.phoneExit.update({
                where: { id },
                data: {
                    status: 'retournee',
                    returnedAt,
                    returnProof: returnProof?.trim() ?? '',
                },
                include: {
                    phone: { include: { addedBy: { select: { id: true, name: true } } } },
                    createdBy: { select: { id: true, name: true } },
                },
            });
            await tx.phone.update({
                where: { id: exit.phoneId },
                data: { status: 'disponible' },
            });
            await tx.stockMovement.create({
                data: {
                    type: 'retour_sortie',
                    phoneId: exit.phoneId,
                    performedById: req.user.userId,
                    notes: notes.trim()
                        ? `Retour sortie — ${notes.trim()}`
                        : `Retour sortie — ${exit.personName}`,
                },
            });
            await tx.alert.updateMany({
                where: { type: 'sortie_echeance', relatedId: id, status: { not: 'resolue' } },
                data: { status: 'resolue' },
            });
            return u;
        });
        await (0, activity_service_1.logActivity)(req.user.userId, 'SORTIE_RETURNED', `Retour sortie : ${exit.personName} — ${exit.phone.brand} ${exit.phone.model}`);
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=sorties.routes.js.map