"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_middleware_1 = require("../middleware/auth.middleware");
const alert_service_1 = require("../services/alert.service");
const activity_service_1 = require("../services/activity.service");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// GET /api/alerts
router.get('/', async (req, res, next) => {
    try {
        const { type, status } = req.query;
        const where = {};
        if (type)
            where.type = type;
        if (status)
            where.status = status;
        const alerts = await prisma_1.prisma.alert.findMany({
            where,
            orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        });
        res.json(alerts);
    }
    catch (err) {
        next(err);
    }
});
// GET /api/alerts/count
router.get('/count', async (_req, res, next) => {
    try {
        const count = await prisma_1.prisma.alert.count({ where: { status: 'nouvelle' } });
        res.json({ count });
    }
    catch (err) {
        next(err);
    }
});
// POST /api/alerts/refresh  — régénère les alertes automatiques
router.post('/refresh', async (req, res, next) => {
    try {
        const newCount = await (0, alert_service_1.refreshAlerts)();
        res.json({ message: 'Alertes actualisées', newAlertsCount: newCount });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /api/alerts/:id  — marquer vue ou résolue
router.patch('/:id', async (req, res, next) => {
    try {
        const { status } = req.body;
        if (!status || !['vue', 'resolue'].includes(status)) {
            throw new error_middleware_1.AppError(400, 'Statut invalide. Valeurs acceptées : vue, resolue');
        }
        const alert = await prisma_1.prisma.alert.update({
            where: { id: req.params.id },
            data: { status },
        });
        if (status === 'resolue') {
            await (0, activity_service_1.logActivity)(req.user.userId, 'ALERT_RESOLVED', `Alerte résolue : ${alert.title}`);
        }
        res.json(alert);
    }
    catch (err) {
        next(err);
    }
});
// DELETE /api/alerts/:id
router.delete('/:id', async (req, res, next) => {
    try {
        await prisma_1.prisma.alert.delete({ where: { id: req.params.id } });
        res.json({ message: 'Alerte supprimée' });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=alerts.routes.js.map