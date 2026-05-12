import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { logger } from '../lib/logger'

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Erreurs de validation Zod
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Données invalides',
      details: err.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
    })
    return
  }

  // Erreurs applicatives connues
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code })
    return
  }

  // Erreur Prisma — clé unique violée
  if ((err as NodeJS.ErrnoException).code === 'P2002') {
    res.status(409).json({ error: 'Un enregistrement avec ces données existe déjà' })
    return
  }

  // Erreur Prisma — enregistrement introuvable
  if ((err as NodeJS.ErrnoException).code === 'P2025') {
    res.status(404).json({ error: 'Enregistrement introuvable' })
    return
  }

  // Erreur interne non gérée
  logger.error(`Unhandled error: ${err.message}\n${err.stack ?? ''}`)
  res.status(500).json({ error: 'Erreur serveur interne' })
}
