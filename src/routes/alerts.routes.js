import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { refreshAlerts } from '../services/alert.service.js'
import { logActivity } from '../services/activity.service.js'
import { AppError } from '../middleware/error.middleware.js'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const { type, status } = req.query
    const where = {}
    if (type) where.type = type
    if (status) where.status = status

    const alerts = await prisma.alert.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })
    res.json(alerts)
  } catch (err) {
    next(err)
  }
})

router.get('/count', async (_req, res, next) => {
  try {
    const count = await prisma.alert.count({ where: { status: 'nouvelle' } })
    res.json({ count })
  } catch (err) {
    next(err)
  }
})

router.post('/refresh', async (_req, res, next) => {
  try {
    const newCount = await refreshAlerts()
    res.json({ message: 'Alertes actualisées', newAlertsCount: newCount })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const { status } = req.body
    if (!status || !['vue', 'resolue'].includes(status)) {
      throw new AppError(400, 'Statut invalide. Valeurs acceptées : vue, resolue')
    }

    const alert = await prisma.alert.update({
      where: { id: req.params.id },
      data: { status },
    })

    if (status === 'resolue') {
      await logActivity(req.user.userId, 'ALERT_RESOLVED', `Alerte résolue : ${alert.title}`)
    }

    res.json(alert)
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.alert.delete({ where: { id: req.params.id } })
    res.json({ message: 'Alerte supprimée' })
  } catch (err) {
    next(err)
  }
})

export default router
