import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.middleware.js'

const router = Router()
router.use(authenticate)

const DEFAULT_BUNDLE_LIMIT = 180
const MAX_BUNDLE_LIMIT = 280

const saleIncludeBundle = {
  phone: { select: { id: true, brand: true, model: true, imei: true, capacity: true, color: true } },
  client: { select: { id: true, name: true, phone: true, email: true } },
  seller: { select: { id: true, name: true } },
  payments: { orderBy: { date: 'asc' } },
}

function parsePhotosJson(photos) {
  try {
    return JSON.parse(photos)
  } catch {
    return []
  }
}

router.get('/', async (req, res, next) => {
  try {
    const raw = parseInt(String(req.query.limit ?? ''), 10)
    const limit =
      Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_BUNDLE_LIMIT) : DEFAULT_BUNDLE_LIMIT

    const [
      phones,
      phonesTotal,
      sales,
      salesTotal,
      clientsRaw,
      movements,
      movementsTotal,
      alerts,
      sorties,
      debtByClient,
    ] = await Promise.all([
      prisma.phone.findMany({
        include: { addedBy: { select: { id: true, name: true } } },
        orderBy: { addedAt: 'desc' },
        take: limit,
      }),
      prisma.phone.count(),
      prisma.sale.findMany({
        include: saleIncludeBundle,
        orderBy: { date: 'desc' },
        take: limit,
      }),
      prisma.sale.count(),
      prisma.client.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.stockMovement.findMany({
        include: {
          phone: { select: { id: true, brand: true, model: true, imei: true } },
          performedBy: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
        take: limit,
      }),
      prisma.stockMovement.count(),
      prisma.alert.findMany({
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.phoneExit.findMany({
        include: {
          phone: { include: { addedBy: { select: { id: true, name: true } } } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.sale.groupBy({
        by: ['clientId'],
        where: { type: 'credit', paymentStatus: { not: 'paye' } },
        _sum: { remainingAmount: true },
      }),
    ])

    const debtMap = new Map(debtByClient.map(d => [d.clientId, d._sum.remainingAmount ?? 0]))
    const clients = clientsRaw.map(c => ({ ...c, totalDebt: debtMap.get(c.id) ?? 0 }))

    const phonesOut = phones.map(p => ({ ...p, photos: parsePhotosJson(p.photos) }))

    const movementsOut = movements.map(m => {
      const pb = m.performedBy
      return {
        ...m,
        performedBy: pb?.id ?? m.performedById,
      }
    })

    res.json({
      phones: phonesOut,
      sales,
      clients,
      movements: movementsOut,
      alerts,
      sorties,
      meta: {
        limit,
        phonesTotal,
        salesTotal,
        movementsTotal,
      },
    })
  } catch (err) {
    next(err)
  }
})

router.get('/stats', async (_req, res, next) => {
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [
      totalStock,
      soldToday,
      activeCredits,
      totalDebtResult,
      stockValueResult,
      monthlyRevenueResult,
      newAlerts,
    ] = await Promise.all([
      prisma.phone.count({ where: { status: 'disponible' } }),
      prisma.sale.count({ where: { date: { gte: todayStart } } }),
      prisma.sale.count({ where: { type: 'credit', paymentStatus: { not: 'paye' } } }),
      prisma.sale.aggregate({
        where: { type: 'credit', paymentStatus: { not: 'paye' } },
        _sum: { remainingAmount: true },
      }),
      prisma.phone.aggregate({
        where: { status: 'disponible' },
        _sum: { sellingPrice: true },
      }),
      prisma.payment.aggregate({
        where: { date: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
        _sum: { amount: true },
      }),
      prisma.alert.count({ where: { status: 'nouvelle' } }),
    ])

    res.json({
      totalStock,
      soldToday,
      activeCredits,
      totalDebt: totalDebtResult._sum.remainingAmount ?? 0,
      stockValue: stockValueResult._sum.sellingPrice ?? 0,
      monthlyRevenue: monthlyRevenueResult._sum.amount ?? 0,
      newAlerts,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/chart-data', async (_req, res, next) => {
  try {
    const now = new Date()
    const months = []

    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
      const label = start.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
      months.push({ label, start, end })
    }

    const chartData = await Promise.all(
      months.map(async ({ label, start, end }) => {
        const [revenue, salesCount] = await Promise.all([
          prisma.payment.aggregate({
            where: { date: { gte: start, lte: end } },
            _sum: { amount: true },
          }),
          prisma.sale.count({ where: { date: { gte: start, lte: end } } }),
        ])
        return { month: label, revenue: revenue._sum.amount ?? 0, sales: salesCount }
      }),
    )

    res.json(chartData)
  } catch (err) {
    next(err)
  }
})

router.get('/recent-activity', async (_req, res, next) => {
  try {
    const logs = await prisma.activityLog.findMany({
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { timestamp: 'desc' },
      take: 20,
    })
    res.json(logs)
  } catch (err) {
    next(err)
  }
})

export default router
