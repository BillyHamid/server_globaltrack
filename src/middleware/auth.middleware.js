import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'

/**
 * Authentifié par Bearer JWT → req.user enrichi Express.
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token manquant ou invalide' })
    return
  }

  const token = authHeader.slice(7)
  try {
    if (!process.env.JWT_SECRET) {
      res.status(500).json({ error: 'Configuration serveur JWT manquante' })
      return
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('userId' in payload && 'email' in payload && 'role' in payload)
    ) {
      res.status(401).json({ error: 'Token expiré ou invalide' })
      return
    }
    req.user = {
      userId: /** @type {{ userId: string }} */ (payload).userId,
      email: /** @type {{ email: string }} */ (payload).email,
      role: /** @type {{ role: string }} */ (payload).role,
    }
    next()
  } catch {
    res.status(401).json({ error: 'Token expiré ou invalide' })
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
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
export async function requireActiveUser(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Non authentifié' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
  if (!user || !user.isActive) {
    res.status(401).json({ error: 'Compte désactivé ou introuvable' })
    return
  }
  next()
}
