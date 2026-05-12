import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth.middleware'
import { validate } from '../middleware/validate.middleware'
import { logActivity } from '../services/activity.service'
import { AppError } from '../middleware/error.middleware'

const router = Router()
router.use(authenticate)

const emptyToString = (v: unknown) => (v == null || v === '' ? '' : String(v).trim())

const clientSchema = z.object({
  name: z.string().min(2, 'Nom trop court').max(200).transform(s => s.trim()),
  phone: z.string().min(6, 'Numéro trop court').max(40).transform(s => s.trim()),
  email: z.preprocess(
    emptyToString,
    z.union([z.literal(''), z.string().email('Email invalide')]),
  ),
  address: z.preprocess(
    emptyToString,
    z.string().max(500),
  ),
})

// GET /api/clients
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search } = req.query as { search?: string }
    const where = search
      ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }, { email: { contains: search } }] }
      : {}

    const clients = await prisma.client.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    // Calculer la dette réelle
    const clientsWithDebt = await Promise.all(
      clients.map(async c => {
        const debt = await prisma.sale.aggregate({
          where: { clientId: c.id, type: 'credit', paymentStatus: { not: 'paye' } },
          _sum: { remainingAmount: true },
        })
        return { ...c, totalDebt: debt._sum.remainingAmount ?? 0 }
      }),
    )

    res.json(clientsWithDebt)
  } catch (err) { next(err) }
})

// GET /api/clients/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } })
    if (!client) throw new AppError(404, 'Client introuvable')

    const [sales, debt] = await Promise.all([
      prisma.sale.findMany({
        where: { clientId: client.id },
        include: {
          phone: { select: { id: true, brand: true, model: true, imei: true } },
          payments: true,
          seller: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
      }),
      prisma.sale.aggregate({
        where: { clientId: client.id, type: 'credit', paymentStatus: { not: 'paye' } },
        _sum: { remainingAmount: true },
      }),
    ])

    res.json({ ...client, totalDebt: debt._sum.remainingAmount ?? 0, sales })
  } catch (err) { next(err) }
})

// GET /api/clients/:id/debt
router.get('/:id/debt', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await prisma.sale.aggregate({
      where: { clientId: req.params.id, type: 'credit', paymentStatus: { not: 'paye' } },
      _sum: { remainingAmount: true },
    })
    res.json({ totalDebt: result._sum.remainingAmount ?? 0 })
  } catch (err) { next(err) }
})

// POST /api/clients
router.post('/', validate(clientSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await prisma.client.create({ data: req.body as z.infer<typeof clientSchema> })
    await logActivity(req.user!.userId, 'CLIENT_ADDED', `Nouveau client : ${client.name} (${client.phone})`)
    res.status(201).json({ ...client, totalDebt: 0 })
  } catch (err) { next(err) }
})

// PATCH /api/clients/:id
router.patch('/:id', validate(clientSchema.partial()), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await prisma.client.update({ where: { id: req.params.id }, data: req.body })
    await logActivity(req.user!.userId, 'CLIENT_UPDATED', `Client modifié : ${client.name}`)
    res.json(client)
  } catch (err) { next(err) }
})

export default router
