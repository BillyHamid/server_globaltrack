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
const MAX_DEPOSIT_PROOF_CHARS = 1_000_000;
const createSaleSchema = zod_1.z.object({
    phoneId: zod_1.z.string().min(1),
    clientId: zod_1.z.string().min(1),
    type: zod_1.z.enum(['cash', 'credit']),
    totalAmount: zod_1.z.number().positive(),
    paidAmount: zod_1.z.number().min(0).default(0),
    dueDate: zod_1.z.string().datetime({ offset: true }).optional(),
    notes: zod_1.z.string().optional().default(''),
    paymentMethod: zod_1.z.string().optional().default('cash'),
    // Preuve de dépôt (data URL) pour le versement enregistré avec la vente
    depositProof: zod_1.z.string().max(MAX_DEPOSIT_PROOF_CHARS).optional().default(''),
});
const addPaymentSchema = zod_1.z.object({
    amount: zod_1.z.number().positive('Montant invalide'),
    method: zod_1.z.enum(['cash', 'mobile_money', 'virement']).default('cash'),
    notes: zod_1.z.string().optional().default(''),
    date: zod_1.z.string().datetime({ offset: true }).optional(),
    depositProof: zod_1.z.string().max(MAX_DEPOSIT_PROOF_CHARS).optional().default(''),
});
const patchPaymentDepositProofSchema = zod_1.z.object({
    depositProof: zod_1.z.string().min(1, 'Image requise').max(MAX_DEPOSIT_PROOF_CHARS),
});
const saleInclude = {
    phone: { select: { id: true, brand: true, model: true, imei: true, capacity: true, color: true } },
    client: { select: { id: true, name: true, phone: true, email: true } },
    seller: { select: { id: true, name: true } },
    payments: { orderBy: { date: 'asc' } },
};
// GET /api/sales
router.get('/', async (req, res, next) => {
    try {
        const { type, paymentStatus, clientId, search, overdue, page = '1', limit = '50' } = req.query;
        const where = {};
        if (type)
            where.type = type;
        if (paymentStatus)
            where.paymentStatus = paymentStatus;
        if (clientId)
            where.clientId = clientId;
        if (overdue === 'true') {
            Object.assign(where, { type: 'credit', paymentStatus: { not: 'paye' }, dueDate: { lt: new Date() } });
        }
        if (search) {
            where.OR = [
                { client: { name: { contains: search } } },
                { phone: { model: { contains: search } } },
                { phone: { imei: { contains: search } } },
            ];
        }
        const [sales, total] = await Promise.all([
            prisma_1.prisma.sale.findMany({
                where,
                include: saleInclude,
                orderBy: { date: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
            }),
            prisma_1.prisma.sale.count({ where }),
        ]);
        res.json({ data: sales, total, page: parseInt(page), limit: parseInt(limit) });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/sales/:id
router.get('/:id', async (req, res, next) => {
    try {
        const sale = await prisma_1.prisma.sale.findUnique({ where: { id: req.params.id }, include: saleInclude });
        if (!sale)
            throw new error_middleware_1.AppError(404, 'Vente introuvable');
        res.json(sale);
    }
    catch (err) {
        next(err);
    }
});
// POST /api/sales
router.post('/', (0, validate_middleware_1.validate)(createSaleSchema), async (req, res, next) => {
    try {
        const body = req.body;
        // Vérifier que le téléphone est disponible
        const phone = await prisma_1.prisma.phone.findUnique({ where: { id: body.phoneId } });
        if (!phone)
            throw new error_middleware_1.AppError(404, 'Téléphone introuvable');
        if (phone.status !== 'disponible') {
            throw new error_middleware_1.AppError(400, `Ce téléphone n'est pas disponible (statut: ${phone.status})`);
        }
        const client = await prisma_1.prisma.client.findUnique({ where: { id: body.clientId } });
        if (!client)
            throw new error_middleware_1.AppError(404, 'Client introuvable');
        const remainingAmount = body.totalAmount - body.paidAmount;
        const paymentStatus = remainingAmount <= 0 ? 'paye' : body.paidAmount > 0 ? 'partiel' : 'impaye';
        const sale = await prisma_1.prisma.sale.create({
            data: {
                phoneId: body.phoneId,
                clientId: body.clientId,
                sellerId: req.user.userId,
                type: body.type,
                totalAmount: body.totalAmount,
                paidAmount: body.paidAmount,
                remainingAmount,
                paymentStatus,
                dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
                notes: body.notes,
            },
            include: saleInclude,
        });
        // Enregistrer le paiement initial si existant
        if (body.paidAmount > 0) {
            await prisma_1.prisma.payment.create({
                data: {
                    saleId: sale.id,
                    amount: body.paidAmount,
                    method: body.paymentMethod,
                    receivedById: req.user.userId,
                    depositProof: body.depositProof?.trim() ?? '',
                },
            });
        }
        // Mettre à jour le statut du téléphone
        const newPhoneStatus = body.type === 'cash' || paymentStatus === 'paye' ? 'vendu' : 'credit';
        await prisma_1.prisma.phone.update({ where: { id: body.phoneId }, data: { status: newPhoneStatus } });
        // Incrémenter le compteur d'achats du client
        await prisma_1.prisma.client.update({
            where: { id: body.clientId },
            data: { totalPurchases: { increment: 1 } },
        });
        // Mouvement de stock
        await prisma_1.prisma.stockMovement.create({
            data: { type: 'vente', phoneId: body.phoneId, performedById: req.user.userId },
        });
        await (0, activity_service_1.logActivity)(req.user.userId, 'SALE_CREATED', `Vente ${body.type} — ${phone.brand} ${phone.model} à ${client.name} — ${body.totalAmount.toLocaleString('fr-FR')} FC`);
        const fullSale = await prisma_1.prisma.sale.findUnique({
            where: { id: sale.id },
            include: saleInclude,
        });
        if (!fullSale)
            throw new error_middleware_1.AppError(500, 'Vente créée mais relecture impossible');
        res.status(201).json(fullSale);
    }
    catch (err) {
        next(err);
    }
});
// PATCH /api/sales/:id (notes / dueDate)
router.patch('/:id', async (req, res, next) => {
    try {
        const { notes, dueDate } = req.body;
        const sale = await prisma_1.prisma.sale.update({
            where: { id: req.params.id },
            data: { notes, dueDate: dueDate ? new Date(dueDate) : undefined },
            include: saleInclude,
        });
        res.json(sale);
    }
    catch (err) {
        next(err);
    }
});
// POST /api/sales/:id/payments
router.post('/:id/payments', (0, validate_middleware_1.validate)(addPaymentSchema), async (req, res, next) => {
    try {
        const body = req.body;
        const sale = await prisma_1.prisma.sale.findUnique({ where: { id: req.params.id } });
        if (!sale)
            throw new error_middleware_1.AppError(404, 'Vente introuvable');
        if (sale.paymentStatus === 'paye')
            throw new error_middleware_1.AppError(400, 'Cette vente est déjà entièrement réglée');
        if (body.amount > sale.remainingAmount) {
            throw new error_middleware_1.AppError(400, `Montant (${body.amount}) supérieur au restant dû (${sale.remainingAmount})`);
        }
        const payment = await prisma_1.prisma.payment.create({
            data: {
                saleId: sale.id,
                amount: body.amount,
                method: body.method,
                notes: body.notes,
                receivedById: req.user.userId,
                date: body.date ? new Date(body.date) : undefined,
                depositProof: body.depositProof?.trim() ?? '',
            },
        });
        const newPaid = sale.paidAmount + body.amount;
        const newRemaining = sale.remainingAmount - body.amount;
        const newStatus = newRemaining <= 0 ? 'paye' : 'partiel';
        await prisma_1.prisma.sale.update({
            where: { id: sale.id },
            data: { paidAmount: newPaid, remainingAmount: newRemaining, paymentStatus: newStatus },
        });
        // Si soldé → téléphone passe à "vendu"
        if (newStatus === 'paye') {
            await prisma_1.prisma.phone.update({ where: { id: sale.phoneId }, data: { status: 'vendu' } });
        }
        await (0, activity_service_1.logActivity)(req.user.userId, 'PAYMENT_ADDED', `Paiement de ${body.amount.toLocaleString('fr-FR')} FC reçu pour la vente ${sale.id}`);
        res.status(201).json({ payment, sale: { ...sale, paidAmount: newPaid, remainingAmount: newRemaining, paymentStatus: newStatus } });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /api/sales/:id/payments/:paymentId — ajouter / remplacer la preuve de dépôt (après coup)
router.patch('/:id/payments/:paymentId', (0, validate_middleware_1.validate)(patchPaymentDepositProofSchema), async (req, res, next) => {
    try {
        const { id: saleId, paymentId } = req.params;
        const { depositProof } = req.body;
        const existing = await prisma_1.prisma.payment.findFirst({
            where: { id: paymentId, saleId },
        });
        if (!existing)
            throw new error_middleware_1.AppError(404, 'Paiement introuvable pour cette vente');
        const payment = await prisma_1.prisma.payment.update({
            where: { id: paymentId },
            data: { depositProof: depositProof.trim() },
        });
        await (0, activity_service_1.logActivity)(req.user.userId, 'PAYMENT_PROOF_UPDATED', `Preuve de dépôt mise à jour — paiement ${paymentId} — vente ${saleId} — ${payment.amount.toLocaleString('fr-FR')} FC`);
        res.json(payment);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=sales.routes.js.map