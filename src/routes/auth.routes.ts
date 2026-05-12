import { Router, Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { validate } from '../middleware/validate.middleware'
import { authenticate } from '../middleware/auth.middleware'
import { logActivity } from '../services/activity.service'
import { AppError } from '../middleware/error.middleware'

const router = Router()

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

function signTokens(userId: string, email: string, role: string) {
  const payload = { userId, email, role }
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  } as jwt.SignOptions)
  const refreshToken = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  } as jwt.SignOptions)
  return { accessToken, refreshToken }
}

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.isActive) {
      throw new AppError(401, 'Email ou mot de passe incorrect')
    }

    const match = await bcrypt.compare(password, user.password)
    if (!match) throw new AppError(401, 'Email ou mot de passe incorrect')

    const { accessToken, refreshToken } = signTokens(user.id, user.email, user.role)

    // Stocker le refresh token
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } })

    await logActivity(user.id, 'LOGIN', `Connexion depuis ${req.ip}`)

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id, name: user.name, email: user.email,
        role: user.role, phone: user.phone, avatar: user.avatar, isActive: user.isActive,
      },
    })
  } catch (err) { next(err) }
})

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string }
    if (!refreshToken) throw new AppError(400, 'Refresh token manquant')

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } })
    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError(401, 'Refresh token invalide ou expiré')
    }

    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET!) as { userId: string; email: string; role: string }
    const { accessToken, refreshToken: newRefresh } = signTokens(payload.userId, payload.email, payload.role)

    // Rotation du refresh token
    await prisma.refreshToken.delete({ where: { token: refreshToken } })
    await prisma.refreshToken.create({
      data: { token: newRefresh, userId: payload.userId, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    })

    res.json({ accessToken, refreshToken: newRefresh })
  } catch (err) { next(err) }
})

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string }
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } })
    }
    res.json({ message: 'Déconnecté avec succès' })
  } catch (err) { next(err) }
})

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, name: true, email: true, role: true, phone: true, avatar: true, isActive: true, createdAt: true },
    })
    if (!user) throw new AppError(404, 'Utilisateur introuvable')
    res.json(user)
  } catch (err) { next(err) }
})

export default router
