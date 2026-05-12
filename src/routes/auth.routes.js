import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { validate } from '../middleware/validate.middleware.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { logActivity } from '../services/activity.service.js'
import { AppError } from '../middleware/error.middleware.js'

const router = Router()

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

function signTokens(userId, email, role) {
  const payload = { userId, email, role }
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  })
  const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  })
  return { accessToken, refreshToken }
}

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.isActive) {
      throw new AppError(401, 'Email ou mot de passe incorrect')
    }

    const match = await bcrypt.compare(password, user.password)
    if (!match) throw new AppError(401, 'Email ou mot de passe incorrect')

    const { accessToken, refreshToken } = signTokens(user.id, user.email, user.role)

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt },
    })

    await logActivity(user.id, 'LOGIN', `Connexion depuis ${req.ip}`)

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        isActive: user.isActive,
      },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) throw new AppError(400, 'Refresh token manquant')

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } })
    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError(401, 'Refresh token invalide ou expiré')
    }

    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET)
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('userId' in payload && 'email' in payload && 'role' in payload)
    ) {
      throw new AppError(401, 'Refresh token invalide ou expiré')
    }
    const {
      accessToken,
      refreshToken: newRefresh,
    } = signTokens(
      /** @type {{ userId: string }} */ (payload).userId,
      /** @type {{ email: string }} */ (payload).email,
      /** @type {{ role: string }} */ (payload).role,
    )

    await prisma.refreshToken.delete({ where: { token: refreshToken } })
    await prisma.refreshToken.create({
      data: {
        token: newRefresh,
        userId: /** @type {{ userId: string }} */ (payload).userId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    res.json({ accessToken, refreshToken: newRefresh })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const { refreshToken } = req.body
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } })
    }
    res.json({ message: 'Déconnecté avec succès' })
  } catch (err) {
    next(err)
  }
})

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        avatar: true,
        isActive: true,
        createdAt: true,
      },
    })
    if (!user) throw new AppError(404, 'Utilisateur introuvable')
    res.json(user)
  } catch (err) {
    next(err)
  }
})

export default router
