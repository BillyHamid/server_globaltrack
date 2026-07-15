import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, authorize } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { logActivity } from '../services/activity.service.js'
import { AppError } from '../middleware/error.middleware.js'

const router = Router()
router.use(authenticate)

const MAX_DEPOSIT_PROOF_CHARS = 1_000_000

const createSaleSchema = z.object({
  phoneId: z.string().min(1),
  clientId: z.string().min(1),
  type: z.enum(['cash', 'credit']),
  listPriceAtSale: z.number().positive().optional(),
  totalAmount: z.number().positive(),
  paidAmount: z.number().min(0).default(0),
  dueDate: z.string().datetime({ offset: true }).optional(),
  notes: z.string().optional().default(''),
  paymentMethod: z.string().optional().default('cash'),
  depositProof: z.string().max(MAX_DEPOSIT_PROOF_CHARS).optional().default(''),
})

const addPaymentSchema = z.object({
  amount: z.number().positive('Montant invalide'),
  method: z.enum(['cash', 'mobile_money', 'virement']).default('cash'),
  notes: z.string().optional().default(''),
  date: z.string().datetime({ offset: true }).optional(),
  depositProof: z.string().max(MAX_DEPOSIT_PROOF_CHARS).optional().default(''),
})

const patchPaymentDepositProofSchema = z.object({
  depositProof: z.string().min(1, 'Image requise').max(MAX_DEPOSIT_PROOF_CHARS),
})

const saleInclude = {
  phone: {
    select: { id: true, brand: true, model: true, imei: true, capacity: true, color: true },
  },
  client: { select: { id: true, name: true, phone: true, email: true } },
  seller: { select: { id: true, name: true } },
  verifiedBy: { select: { id: true, name: true } },
  payments: { orderBy: { date: 'asc' } },
}

const verifySaleSchema = z.object({
  status: z.enum(['approuve', 'anomalie']),
  comment: z.string().max(1000).optional().default(''),
})

router.get('/', async (req, res, next) => {
  try {
    const { type, paymentStatus, clientId, search, overdue, page = '1', limit = '50' } = req.query

    const where = {}
    if (type) where.type = type
    if (paymentStatus) where.paymentStatus = paymentStatus
    if (clientId) where.clientId = clientId
    if (overdue === 'true') {
      Object.assign(where, { type: 'credit', paymentStatus: { not: 'paye' }, dueDate: { lt: new Date() } })
    }
    if (search) {
      where.OR = [
        { client: { name: { contains: search } } },
        { phone: { model: { contains: search } } },
        { phone: { imei: { contains: search } } },
      ]
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: saleInclude,
        orderBy: { date: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.sale.count({ where }),
    ])

    res.json({ data: sales, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const sale = await prisma.sale.findUnique({ where: { id: req.params.id }, include: saleInclude })
    if (!sale) throw new AppError(404, 'Vente introuvable')
    res.json(sale)
  } catch (err) {
    next(err)
  }
})

router.post('/', validate(createSaleSchema), async (req, res, next) => {
  try {
    const body = req.body

    const phone = await prisma.phone.findUnique({ where: { id: body.phoneId } })
    if (!phone) throw new AppError(404, 'Téléphone introuvable')
    if (phone.status !== 'disponible') {
      throw new AppError(400, `Ce téléphone n'est pas disponible (statut: ${phone.status})`)
    }

    const client = await prisma.client.findUnique({ where: { id: body.clientId } })
    if (!client) throw new AppError(404, 'Client introuvable')

    const remainingAmount = body.totalAmount - body.paidAmount
    const paymentStatus =
      remainingAmount <= 0 ? 'paye' : body.paidAmount > 0 ? 'partiel' : 'impaye'

    const listPriceAtSale =
      body.listPriceAtSale != null && body.listPriceAtSale > 0
        ? body.listPriceAtSale
        : phone.sellingPrice > 0
          ? phone.sellingPrice
          : body.totalAmount

    const sale = await prisma.sale.create({
      data: {
        phoneId: body.phoneId,
        clientId: body.clientId,
        sellerId: req.user.userId,
        type: body.type,
        listPriceAtSale,
        totalAmount: body.totalAmount,
        paidAmount: body.paidAmount,
        remainingAmount,
        paymentStatus,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        notes: body.notes,
      },
      include: saleInclude,
    })

    if (body.paidAmount > 0) {
      await prisma.payment.create({
        data: {
          saleId: sale.id,
          amount: body.paidAmount,
          method: body.paymentMethod,
          receivedById: req.user.userId,
          depositProof: body.depositProof?.trim() ?? '',
        },
      })
    }

    const newPhoneStatus = body.type === 'cash' || paymentStatus === 'paye' ? 'vendu' : 'credit'
    await prisma.phone.update({ where: { id: body.phoneId }, data: { status: newPhoneStatus } })

    await prisma.client.update({
      where: { id: body.clientId },
      data: { totalPurchases: { increment: 1 } },
    })

    await prisma.stockMovement.create({
      data: { type: 'vente', phoneId: body.phoneId, performedById: req.user.userId },
    })

    await logActivity(
      req.user.userId,
      'SALE_CREATED',
      `Vente ${body.type} — ${phone.brand} ${phone.model} à ${client.name} — ${body.totalAmount.toLocaleString('fr-FR')} FC`,
    )

    const fullSale = await prisma.sale.findUnique({
      where: { id: sale.id },
      include: saleInclude,
    })
    if (!fullSale) throw new AppError(500, 'Vente créée mais relecture impossible')
    res.status(201).json(fullSale)
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const { notes, dueDate } = req.body
    const sale = await prisma.sale.update({
      where: { id: req.params.id },
      data: { notes, dueDate: dueDate ? new Date(dueDate) : undefined },
      include: saleInclude,
    })
    res.json(sale)
  } catch (err) {
    next(err)
  }
})

router.post('/:id/payments', validate(addPaymentSchema), async (req, res, next) => {
  try {
    const body = req.body

    const sale = await prisma.sale.findUnique({ where: { id: req.params.id } })
    if (!sale) throw new AppError(404, 'Vente introuvable')
    if (sale.paymentStatus === 'paye') throw new AppError(400, 'Cette vente est déjà entièrement réglée')
    if (body.amount > sale.remainingAmount) {
      throw new AppError(400, `Montant (${body.amount}) supérieur au restant dû (${sale.remainingAmount})`)
    }

    const payment = await prisma.payment.create({
      data: {
        saleId: sale.id,
        amount: body.amount,
        method: body.method,
        notes: body.notes,
        receivedById: req.user.userId,
        date: body.date ? new Date(body.date) : undefined,
        depositProof: body.depositProof?.trim() ?? '',
      },
    })

    const newPaid = sale.paidAmount + body.amount
    const newRemaining = sale.remainingAmount - body.amount
    const newStatus = newRemaining <= 0 ? 'paye' : 'partiel'

    await prisma.sale.update({
      where: { id: sale.id },
      data: { paidAmount: newPaid, remainingAmount: newRemaining, paymentStatus: newStatus },
    })

    if (newStatus === 'paye') {
      await prisma.phone.update({ where: { id: sale.phoneId }, data: { status: 'vendu' } })
    }

    await logActivity(
      req.user.userId,
      'PAYMENT_ADDED',
      `Paiement de ${body.amount.toLocaleString('fr-FR')} FC reçu pour la vente ${sale.id}`,
    )

    res.status(201).json({
      payment,
      sale: { ...sale, paidAmount: newPaid, remainingAmount: newRemaining, paymentStatus: newStatus },
    })
  } catch (err) {
    next(err)
  }
})

router.patch(
  '/:id/payments/:paymentId',
  validate(patchPaymentDepositProofSchema),
  async (req, res, next) => {
    try {
      const { id: saleId, paymentId } = req.params
      const { depositProof } = req.body

      const existing = await prisma.payment.findFirst({
        where: { id: paymentId, saleId },
      })
      if (!existing) throw new AppError(404, 'Paiement introuvable pour cette vente')

      const payment = await prisma.payment.update({
        where: { id: paymentId },
        data: { depositProof: depositProof.trim() },
      })

      await logActivity(
        req.user.userId,
        'PAYMENT_PROOF_UPDATED',
        `Preuve de dépôt mise à jour — paiement ${paymentId} — vente ${saleId} — ${payment.amount.toLocaleString('fr-FR')} FC`,
      )

      res.json(payment)
    } catch (err) {
      next(err)
    }
  },
)

router.patch('/:id/verify', authorize('admin', 'gestionnaire'), validate(verifySaleSchema), async (req, res, next) => {
  try {
    const { status, comment } = req.body
    const sale = await prisma.sale.findUnique({ where: { id: req.params.id } })
    if (!sale) throw new AppError(404, 'Vente introuvable')

    const updated = await prisma.sale.update({
      where: { id: req.params.id },
      data: {
        verificationStatus: status,
        verificationComment: comment ?? '',
        verifiedAt: new Date(),
        verifiedById: req.user.userId,
      },
      include: saleInclude,
    })

    await logActivity(
      req.user.userId,
      'SALE_VERIFIED',
      `Vente ${req.params.id} marquée "${status}"${comment ? ` — ${comment}` : ''}`,
    )

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

router.patch('/:id/cancel', authorize('admin', 'gestionnaire'), async (req, res, next) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: { phone: true, client: true },
    })
    if (!sale) throw new AppError(404, 'Vente introuvable')
    if (sale.status === 'annulée') throw new AppError(400, 'Cette vente est déjà annulée')

    let updated
    await prisma.$transaction(async (tx) => {
      updated = await tx.sale.update({
        where: { id: sale.id },
        data: { status: 'annulée' },
        include: saleInclude,
      })

      await tx.phone.update({
        where: { id: sale.phoneId },
        data: { status: 'disponible' },
      })

      await tx.client.update({
        where: { id: sale.clientId },
        data: { totalPurchases: { decrement: 1 } },
      })

      await tx.stockMovement.create({
        data: { type: 'retour', phoneId: sale.phoneId, performedById: req.user.userId, notes: 'Annulation de vente' },
      })
    })

    await logActivity(
      req.user.userId,
      'SALE_CANCELLED',
      `Vente annulée — ${sale.phone.brand} ${sale.phone.model} — client ${sale.client.name} — ${sale.totalAmount.toLocaleString('fr-FR')} FC`,
    )

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authorize('admin', 'gestionnaire'), async (req, res, next) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: { phone: true, client: true },
    })
    if (!sale) throw new AppError(404, 'Vente introuvable')

    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { saleId: sale.id } })

      await tx.stockMovement.deleteMany({
        where: { phoneId: sale.phoneId, type: { in: ['vente', 'retour'] } },
      })

      if (sale.status !== 'annulée') {
        await tx.phone.update({
          where: { id: sale.phoneId },
          data: { status: 'disponible' },
        })
        await tx.client.update({
          where: { id: sale.clientId },
          data: { totalPurchases: { decrement: 1 } },
        })
      }

      await tx.sale.delete({ where: { id: sale.id } })
    })

    await logActivity(
      req.user.userId,
      'SALE_DELETED',
      `Vente supprimée définitivement — ${sale.phone.brand} ${sale.phone.model} — client ${sale.client.name} — ${sale.totalAmount.toLocaleString('fr-FR')} FC`,
    )

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
