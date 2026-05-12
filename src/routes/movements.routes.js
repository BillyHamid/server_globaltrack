import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.middleware.js'

const router = Router()
router.use(authenticate)

const movementInclude = {
  phone: { select: { id: true, brand: true, model: true, imei: true } },
  performedBy: { select: { id: true, name: true } },
}

router.get('/', async (req, res, next) => {
  try {
    const { phoneId, type, page = '1', limit = '50' } = req.query

    const where = {}
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
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const movement = await prisma.stockMovement.findUnique({
      where: { id: req.params.id },
      include: movementInclude,
    })
    if (!movement) {
      res.status(404).json({ error: 'Mouvement introuvable' })
      return
    }
    res.json(movement)
  } catch (err) {
    next(err)
  }
})

export default router
