import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'

export interface JwtPayload {
  userId: string
  email: string
  role: string
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token manquant ou invalide' })
    return
  }

  const token = authHeader.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'Token expiré ou invalide' })
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' })
      return
    }
    if (roles.length && !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Accès refusé — permissions insuffisantes' })
      return
    }
    next()
  }
}

// Vérifie que l'utilisateur existe et est actif (optionnel, pour les routes sensibles)
export async function requireActiveUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: 'Non authentifié' }); return }
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
  if (!user || !user.isActive) {
    res.status(401).json({ error: 'Compte désactivé ou introuvable' })
    return
  }
  next()
}
