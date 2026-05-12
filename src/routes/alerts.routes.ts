import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth.middleware'
import { refreshAlerts } from '../services/alert.service'
import { logActivity } from '../services/activity.service'
import { AppError } from '../middleware/error.middleware'

const router = Router()
router.use(authenticate)

// GET /api/alerts
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, status } = req.query as { type?: string; status?: string }
    const where: Record<string, unknown> = {}
    if (type) where.type = type
    if (status) where.status = status

    const alerts = await prisma.alert.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })
    res.json(alerts)
  } catch (err) { next(err) }
})

// GET /api/alerts/count
router.get('/count', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await prisma.alert.count({ where: { status: 'nouvelle' } })
    res.json({ count })
  } catch (err) { next(err) }
})

// POST /api/alerts/refresh  — régénère les alertes automatiques
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const newCount = await refreshAlerts()
    res.json({ message: 'Alertes actualisées', newAlertsCount: newCount })
  } catch (err) { next(err) }
})

// PATCH /api/alerts/:id  — marquer vue ou résolue
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body as { status?: 'vue' | 'resolue' }
    if (!status || !['vue', 'resolue'].includes(status)) {
      throw new AppError(400, 'Statut invalide. Valeurs acceptées : vue, resolue')
    }

    const alert = await prisma.alert.update({
      where: { id: req.params.id },
      data: { status },
    })

    if (status === 'resolue') {
      await logActivity(req.user!.userId, 'ALERT_RESOLVED', `Alerte résolue : ${alert.title}`)
    }

    res.json(alert)
  } catch (err) { next(err) }
})

// DELETE /api/alerts/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.alert.delete({ where: { id: req.params.id } })
    res.json({ message: 'Alerte supprimée' })
  } catch (err) { next(err) }
})

export default router
