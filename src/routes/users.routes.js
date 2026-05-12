import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'
import { authenticate, authorize } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { logActivity } from '../services/activity.service.js'
import { AppError } from '../middleware/error.middleware.js'

const router = Router()
router.use(authenticate)

const userSelectPublic = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  avatar: true,
  isActive: true,
  createdAt: true,
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

router.get('/', authorize('admin', 'gestionnaire'), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: userSelectPublic,
      orderBy: { createdAt: 'asc' },
    })
    res.json(users)
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.userId !== req.params.id) {
      throw new AppError(403, 'Accès refusé')
    }
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: userSelectPublic,
    })
    if (!user) throw new AppError(404, 'Utilisateur introuvable')

    const [salesCount, activityCount] = await Promise.all([
      prisma.sale.count({ where: { sellerId: user.id } }),
      prisma.activityLog.count({ where: { userId: user.id } }),
    ])
    res.json({ ...user, salesCount, activityCount })
  } catch (err) {
    next(err)
  }
})

router.post('/', authorize('admin'), validate(createUserSchema), async (req, res, next) => {
  try {
    const body = req.body
    const hashed = await bcrypt.hash(body.password, 10)
    const user = await prisma.user.create({
      data: { ...body, password: hashed },
      select: userSelectPublic,
    })
    await logActivity(req.user.userId, 'USER_CREATED', `Nouvel utilisateur : ${user.name} (${user.role})`)
    res.status(201).json(user)
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', validate(updateUserSchema), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.userId !== req.params.id) {
      throw new AppError(403, 'Accès refusé')
    }
    const body = req.body
    const updateData = { ...body }
    if (body.password) updateData.password = await bcrypt.hash(body.password, 10)

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: userSelectPublic,
    })
    await logActivity(req.user.userId, 'USER_UPDATED', `Utilisateur modifié : ${user.name}`)
    res.json(user)
  } catch (err) {
    next(err)
  }
})

router.get('/:id/activity', async (req, res, next) => {
  try {
    const logs = await prisma.activityLog.findMany({
      where: { userId: req.params.id },
      orderBy: { timestamp: 'desc' },
      take: 50,
    })
    res.json(logs)
  } catch (err) {
    next(err)
  }
})

export default router
