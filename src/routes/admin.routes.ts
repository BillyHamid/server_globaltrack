import { Router, Request, Response, NextFunction } from "express"
import { prisma } from "../lib/prisma"
import { authenticate, authorize } from "../middleware/auth.middleware"

const router = Router()

router.use(authenticate)
router.use(authorize("admin"))

// ─── Payloads réutilisables (1 requête consolidée + routes historiques) ─────

async function computeAdminDashboardStats() {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    totalStock,
    todaySalesCount,
    activeCreditsRaw,
    stockValueRaw,
    monthlySalesRaw,
    allSalesRaw,
    vendors,
  ] = await Promise.all([
    prisma.phone.count({ where: { status: "disponible" } }),
    prisma.sale.count({ where: { date: { gte: todayStart } } }),
    prisma.sale.findMany({
      where: { paymentStatus: { in: ["partiel", "impaye"] } },
      select: { remainingAmount: true, dueDate: true },
    }),
    prisma.phone.aggregate({
      where: { status: "disponible" },
      _sum: { sellingPrice: true },
    }),
    prisma.payment.aggregate({
      where: { date: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.sale.findMany({
      select: { sellerId: true, totalAmount: true, paidAmount: true },
    }),
    prisma.user.findMany({
      where: { role: { in: ["vendeur", "gestionnaire"] } },
      select: { id: true, name: true, email: true },
    }),
  ])

  const totalDebt = activeCreditsRaw.reduce((s, x) => s + x.remainingAmount, 0)
  const stockValue = stockValueRaw._sum.sellingPrice ?? 0
  const monthlyRevenue = monthlySalesRaw._sum.amount ?? 0

  const vendorPerformance = vendors.map((vendor) => {
    const vendorSales = allSalesRaw.filter(s => s.sellerId === vendor.id)
    const totalSalesAmount = vendorSales.reduce((s, x) => s + x.totalAmount, 0)
    const paymentsReceived = vendorSales.reduce((s, x) => s + x.paidAmount, 0)
    const recoveryRate = totalSalesAmount > 0 ? (paymentsReceived / totalSalesAmount) * 100 : 0
    return {
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorEmail: vendor.email,
      salesCount: vendorSales.length,
      totalSalesAmount: Math.round(totalSalesAmount * 100) / 100,
      paymentsReceived: Math.round(paymentsReceived * 100) / 100,
      averageSaleValue: vendorSales.length > 0
        ? Math.round((totalSalesAmount / vendorSales.length) * 100) / 100
        : 0,
      recoveryRate: Math.round(recoveryRate * 100) / 100,
    }
  })

  const totalSalesAmount = allSalesRaw.reduce((s, x) => s + x.totalAmount, 0)
  const totalPaid = allSalesRaw.reduce((s, x) => s + x.paidAmount, 0)
  const globalRecoveryRate = totalSalesAmount > 0 ? (totalPaid / totalSalesAmount) * 100 : 0

  const overdueCredits = activeCreditsRaw.filter(s => s.dueDate && new Date(s.dueDate) < now).length
  const totalOverdueAmount = activeCreditsRaw
    .filter(s => s.dueDate && new Date(s.dueDate) < now)
    .reduce((s, x) => s + x.remainingAmount, 0)

  return {
    totalStock,
    soldToday: todaySalesCount,
    activeCredits: activeCreditsRaw.length,
    totalDebt: Math.round(totalDebt * 100) / 100,
    stockValue: Math.round(stockValue * 100) / 100,
    monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
    globalRecoveryRate: Math.round(globalRecoveryRate * 100) / 100,
    overdueCredits,
    totalOverdueAmount: Math.round(totalOverdueAmount * 100) / 100,
    vendorPerformance,
  }
}

async function computeAdminRecoveryMetrics() {
  const [byStatusRaw, vendors, allSalesForVendors] = await Promise.all([
    prisma.sale.groupBy({
      by: ["paymentStatus"],
      _sum: { totalAmount: true },
    }),
    prisma.user.findMany({
      where: { role: { in: ["vendeur", "gestionnaire"] } },
      select: { id: true, name: true },
    }),
    prisma.sale.findMany({
      select: { sellerId: true, totalAmount: true, paidAmount: true },
    }),
  ])

  const byStatus = { paye: 0, partiel: 0, impaye: 0 }
  for (const row of byStatusRaw) {
    const key = row.paymentStatus as keyof typeof byStatus
    if (key in byStatus) byStatus[key] = Math.round((row._sum.totalAmount ?? 0) * 100) / 100
  }

  const byVendor = vendors.map(v => {
    const vendorSales = allSalesForVendors.filter(s => s.sellerId === v.id)
    const total = vendorSales.reduce((s, x) => s + x.totalAmount, 0)
    const collected = vendorSales.reduce((s, x) => s + x.paidAmount, 0)
    return {
      vendorName: v.name,
      totalAmount: Math.round(total * 100) / 100,
      collectedAmount: Math.round(collected * 100) / 100,
      rate: total > 0 ? Math.round((collected / total) * 100) / 100 : 0,
    }
  })

  return { byStatus, byVendor }
}

async function computeAdminEmployees() {
  const [employees, allSales, phoneCounts, sortieCounts] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["vendeur", "gestionnaire"] } },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    }),
    prisma.sale.findMany({
      select: { sellerId: true, paymentStatus: true, paidAmount: true },
    }),
    prisma.phone.groupBy({
      by: ["addedById"],
      _count: { _all: true },
    }),
    prisma.phoneExit.groupBy({
      by: ["createdById"],
      _count: { _all: true },
    }),
  ])

  const phoneCountMap = new Map(phoneCounts.map(r => [r.addedById, r._count._all]))
  const sortieCountMap = new Map(sortieCounts.map(r => [r.createdById, r._count._all]))

  return employees.map((emp) => {
    const empSales = allSales.filter(s => s.sellerId === emp.id)
    const activeCredits = empSales.filter(s => s.paymentStatus !== "paye")
    const totalCollected = empSales.reduce((s, x) => s + x.paidAmount, 0)
    return {
      ...emp,
      salesCount: empSales.length,
      activeCredits: activeCredits.length,
      totalCollected: Math.round(totalCollected * 100) / 100,
      phonesAddedCount: phoneCountMap.get(emp.id) ?? 0,
      sortiesCreatedCount: sortieCountMap.get(emp.id) ?? 0,
    }
  })
}

/** GET /api/admin/dashboard — stats + recovery + employés en un seul aller-retour */
router.get("/dashboard", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [stats, recoveryMetrics, employees] = await Promise.all([
      computeAdminDashboardStats(),
      computeAdminRecoveryMetrics(),
      computeAdminEmployees(),
    ])
    res.json({ stats, recoveryMetrics, employees })
  } catch (err) {
    next(err)
  }
})

// ─── Dashboard Stats ───────────────────────────────────────────────────────

router.get("/dashboard/stats", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await computeAdminDashboardStats())
  } catch (err) {
    next(err)
  }
})

// ─── Employees List ───────────────────────────────────────────────────────

router.get("/employees", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await computeAdminEmployees())
  } catch (err) {
    next(err)
  }
})

// ─── Employee Activity ────────────────────────────────────────────────────

router.get("/employees/:vendorId/activity", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { vendorId } = req.params
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
    const offset = parseInt(req.query.offset as string) || 0
    const action = req.query.action as string | undefined

    const where: Record<string, unknown> = { userId: vendorId }
    if (action) where.action = action

    const [data, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.activityLog.count({ where }),
    ])

    res.json({ data, total, limit, offset, page: Math.floor(offset / limit) + 1 })
  } catch (err) {
    next(err)
  }
})

// ─── Employee Sales ───────────────────────────────────────────────────────

router.get("/employees/:vendorId/sales", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { vendorId } = req.params
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
    const offset = parseInt(req.query.offset as string) || 0
    const status = req.query.paymentStatus as string | undefined
    const type = req.query.type as string | undefined

    const where: Record<string, unknown> = { sellerId: vendorId }
    if (status) where.paymentStatus = status
    if (type) where.type = type

    const [data, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          phone: { select: { brand: true, model: true, imei: true } },
          client: { select: { name: true, phone: true } },
          payments: true,
        },
        orderBy: { date: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.sale.count({ where }),
    ])

    const totalAmount = data.reduce((s, x) => s + x.totalAmount, 0)
    const totalPaid = data.reduce((s, x) => s + x.paidAmount, 0)
    const recoveryRate = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0
    const avgAmount = data.length > 0 ? totalAmount / data.length : 0

    res.json({
      data, total, limit, offset,
      page: Math.floor(offset / limit) + 1,
      avgAmount: Math.round(avgAmount * 100) / 100,
      recoveryRate: Math.round(recoveryRate * 100) / 100,
    })
  } catch (err) {
    next(err)
  }
})

// ─── Employee Metrics ────────────────────────────────────────────────────

router.get("/employees/:vendorId/metrics", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { vendorId } = req.params

    const sales = await prisma.sale.findMany({
      where: { sellerId: vendorId },
      select: {
        paymentStatus: true,
        remainingAmount: true,
        paidAmount: true,
        totalAmount: true,
        date: true,
        phone: { select: { addedAt: true } },
      },
    })

    const activeCredits = sales.filter(s => s.paymentStatus !== "paye")
    const totalDebt = activeCredits.reduce((s, x) => s + x.remainingAmount, 0)
    const totalCollected = sales.reduce((s, x) => s + x.paidAmount, 0)
    const totalSalesAmount = sales.reduce((s, x) => s + x.totalAmount, 0)
    const recoveryRate = totalSalesAmount > 0 ? (totalCollected / totalSalesAmount) * 100 : 0

    let avgTimeToSale = 0
    if (sales.length > 0) {
      const times = sales
        .map(s => (new Date(s.date).getTime() - new Date(s.phone.addedAt).getTime()) / 86_400_000)
        .filter(t => t >= 0)
      avgTimeToSale = times.length > 0 ? times.reduce((a, b) => a + b) / times.length : 0
    }

    res.json({
      salesCount: sales.length,
      activeCredits: activeCredits.length,
      totalDebt: Math.round(totalDebt * 100) / 100,
      totalCollected: Math.round(totalCollected * 100) / 100,
      recoveryRate: Math.round(recoveryRate * 100) / 100,
      avgTimeToSale: Math.round(avgTimeToSale * 100) / 100,
    })
  } catch (err) {
    next(err)
  }
})

// ─── Recovery Metrics ────────────────────────────────────────────────────

router.get("/dashboard/recovery-metrics", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await computeAdminRecoveryMetrics())
  } catch (err) {
    next(err)
  }
})

export default router
