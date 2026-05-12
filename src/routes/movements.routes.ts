import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth.middleware'

const router = Router()
router.use(authenticate)

const movementInclude = {
  phone: { select: { id: true, brand: true, model: true, imei: true } },
  performedBy: { select: { id: true, name: true } },
}

// GET /api/movements
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phoneId, type, page = '1', limit = '50' } = req.query as Record<string, string>

    const where: Record<string, unknown> = {}
    if (phoneId) where.phoneId = phoneId
    if (type) where.type = type

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: movementInclude,
        orderBy: { date: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.stockMovement.count({ where }),
    ])

    res.json({ data: movements, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) { next(err) }
})

// GET /api/movements/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const movement = await prisma.stockMovement.findUnique({
      where: { id: req.params.id },
      include: movementInclude,
    })
    if (!movement) { res.status(404).json({ error: 'Mouvement introuvable' }); return }
    res.json(movement)
  } catch (err) { next(err) }
})

export default router
