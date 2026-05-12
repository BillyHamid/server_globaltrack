"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const movementInclude = {
    phone: { select: { id: true, brand: true, model: true, imei: true } },
    performedBy: { select: { id: true, name: true } },
};
// GET /api/movements
router.get('/', async (req, res, next) => {
    try {
        const { phoneId, type, page = '1', limit = '50' } = req.query;
        const where = {};
        if (phoneId)
            where.phoneId = phoneId;
        if (type)
            where.type = type;
        const [movements, total] = await Promise.all([
            prisma_1.prisma.stockMovement.findMany({
                where,
                include: movementInclude,
                orderBy: { date: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
            }),
            prisma_1.prisma.stockMovement.count({ where }),
        ]);
        res.json({ data: movements, total, page: parseInt(page), limit: parseInt(limit) });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/movements/:id
router.get('/:id', async (req, res, next) => {
    try {
        const movement = await prisma_1.prisma.stockMovement.findUnique({
            where: { id: req.params.id },
            include: movementInclude,
        });
        if (!movement) {
            res.status(404).json({ error: 'Mouvement introuvable' });
            return;
        }
        res.json(movement);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=movements.routes.js.map