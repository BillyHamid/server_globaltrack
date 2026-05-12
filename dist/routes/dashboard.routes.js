"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// GET /api/dashboard/stats
router.get('/stats', async (_req, res, next) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const [totalStock, soldToday, activeCredits, totalDebtResult, stockValueResult, monthlyRevenueResult, newAlerts,] = await Promise.all([
            prisma_1.prisma.phone.count({ where: { status: 'disponible' } }),
            prisma_1.prisma.sale.count({ where: { date: { gte: todayStart } } }),
            prisma_1.prisma.sale.count({ where: { type: 'credit', paymentStatus: { not: 'paye' } } }),
            prisma_1.prisma.sale.aggregate({
                where: { type: 'credit', paymentStatus: { not: 'paye' } },
                _sum: { remainingAmount: true },
            }),
            prisma_1.prisma.phone.aggregate({
                where: { status: 'disponible' },
                _sum: { sellingPrice: true },
            }),
            prisma_1.prisma.payment.aggregate({
                where: { date: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
                _sum: { amount: true },
            }),
            prisma_1.prisma.alert.count({ where: { status: 'nouvelle' } }),
        ]);
        res.json({
            totalStock,
            soldToday,
            activeCredits,
            totalDebt: totalDebtResult._sum.remainingAmount ?? 0,
            stockValue: stockValueResult._sum.sellingPrice ?? 0,
            monthlyRevenue: monthlyRevenueResult._sum.amount ?? 0,
            newAlerts,
        });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/dashboard/chart-data  — revenus des 6 derniers mois
router.get('/chart-data', async (_req, res, next) => {
    try {
        const now = new Date();
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
            const label = start.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
            months.push({ label, start, end });
        }
        const chartData = await Promise.all(months.map(async ({ label, start, end }) => {
            const [revenue, salesCount] = await Promise.all([
                prisma_1.prisma.payment.aggregate({
                    where: { date: { gte: start, lte: end } },
                    _sum: { amount: true },
                }),
                prisma_1.prisma.sale.count({ where: { date: { gte: start, lte: end } } }),
            ]);
            return { month: label, revenue: revenue._sum.amount ?? 0, sales: salesCount };
        }));
        res.json(chartData);
    }
    catch (err) {
        next(err);
    }
});
// GET /api/dashboard/recent-activity
router.get('/recent-activity', async (_req, res, next) => {
    try {
        const logs = await prisma_1.prisma.activityLog.findMany({
            include: { user: { select: { id: true, name: true, role: true } } },
            orderBy: { timestamp: 'desc' },
            take: 20,
        });
        res.json(logs);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=dashboard.routes.js.map