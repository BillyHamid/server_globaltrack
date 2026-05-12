import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { authenticate, authorize } from '../middleware/auth.middleware'
import { validate } from '../middleware/validate.middleware'
import { logActivity } from '../services/activity.service'
import { AppError } from '../middleware/error.middleware'

const router = Router()
router.use(authenticate)

const userSelectPublic = {
  id: true, name: true, email: true, role: true,
  phone: true, avatar: true, isActive: true, createdAt: true,
}

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, 'Mot de passe trop court (min 8 caractères)'),
  role: z.enum(['admin', 'vendeur', 'gestionnaire']),
  phone: z.string().optional().default(''),
})

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'vendeur', 'gestionnaire']).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
})

// GET /api/users
router.get('/', authorize('admin', 'gestionnaire'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      select: userSelectPublic,
      orderBy: { createdAt: 'asc' },
    })
    res.json(users)
  } catch (err) { next(err) }
})

// GET /api/users/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Seul l'admin ou l'utilisateur lui-même peut voir le profil complet
    if (req.user!.role !== 'admin' && req.user!.userId !== req.params.id) {
      throw new AppError(403, 'Accès refusé')
    }
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelectPublic })
    if (!user) throw new AppError(404, 'Utilisateur introuvable')

    const [salesCount, activityCount] = await Promise.all([
      prisma.sale.count({ where: { sellerId: user.id } }),
      prisma.activityLog.count({ where: { userId: user.id } }),
    ])
    res.json({ ...user, salesCount, activityCount })
  } catch (err) { next(err) }
})

// POST /api/users  (admin uniquement)
router.post('/', authorize('admin'), validate(createUserSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as z.infer<typeof createUserSchema>
    const hashed = await bcrypt.hash(body.password, 10)
    const user = await prisma.user.create({
      data: { ...body, password: hashed },
      select: userSelectPublic,
    })
    await logActivity(req.user!.userId, 'USER_CREATED', `Nouvel utilisateur : ${user.name} (${user.role})`)
    res.status(201).json(user)
  } catch (err) { next(err) }
})

// PATCH /api/users/:id  (admin ou soi-même)
router.patch('/:id', validate(updateUserSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'admin' && req.user!.userId !== req.params.id) {
      throw new AppError(403, 'Accès refusé')
    }
    const body = req.body as z.infer<typeof updateUserSchema>
    const updateData: Record<string, unknown> = { ...body }
    if (body.password) updateData.password = await bcrypt.hash(body.password, 10)

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: userSelectPublic,
    })
    await logActivity(req.user!.userId, 'USER_UPDATED', `Utilisateur modifié : ${user.name}`)
    res.json(user)
  } catch (err) { next(err) }
})

// GET /api/users/:id/activity
router.get('/:id/activity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await prisma.activityLog.findMany({
      where: { userId: req.params.id },
      orderBy: { timestamp: 'desc' },
      take: 50,
    })
    res.json(logs)
  } catch (err) { next(err) }
})

export default router
