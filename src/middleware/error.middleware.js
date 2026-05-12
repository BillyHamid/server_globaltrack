import { ZodError } from 'zod'
import { logger } from '../lib/logger.js'

export class AppError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {string} [code]
   */
  constructor(statusCode, message, code) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
  }
}

/** @returns {boolean} */
function isPrismaKnownError(err) {
  return !!(err && typeof err === 'object' && typeof err.code === 'string')
}

/** @returns {boolean} */
function isJwtError(err) {
  const n = err && typeof err === 'object' && 'name' in err ? /** @type {string} */ (err.name) : ''
  return n === 'JsonWebTokenError' || n === 'TokenExpiredError'
}

/** @returns {boolean} */
function isBodyParserJsonError(err) {
  const n = err && typeof err === 'object' && 'type' in err ? err.type : null
  return n === 'entity.parse.failed' || n === 'entity.too.large'
}

/**
 * Middleware Express à quatre arguments — doit être défini après toutes les routes.
 * @type {import('express').ErrorRequestHandler}
 */
export function errorHandler(err, _req, res, _next) {
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
    res.status(err.statusCode).json({ error: err.message, ...(err.code && { code: err.code }) })
    return
  }

  // JWT (jwt.verify peut propager jusqu'ici hors try/catch ciblé)
  if (isJwtError(err)) {
    res.status(401).json({ error: 'Token expiré ou invalide' })
    return
  }

  // JSON mal formé ou payload trop volumineux (express.json / body-parser)
  const isJsonBodyError =
    isBodyParserJsonError(err) ||
    (err instanceof SyntaxError &&
      /** @type {{ statusCode?: number }} */ (err).statusCode === 400)

  if (isJsonBodyError) {
    const status =
      typeof err === 'object' &&
      err !== null &&
      ('statusCode' in err || 'status' in err)
        ? Number(
            ('statusCode' in err && typeof /** @type {{ statusCode?: unknown }} */ (err).statusCode === 'number')
              ? /** @type {{ statusCode?: number }} */ (err).statusCode
              : ('status' in err && typeof /** @type {{ status?: unknown }} */ (err).status === 'number')
                ? /** @type {{ status?: number }} */ (err).status
                : 400,
          )
        : 400
    res.status(Number.isFinite(status) ? status : 400).json({
      error: 'Corps JSON invalide ou volumétrie trop importante',
    })
    return
  }

  // Erreur Prisma — clés connues via code
  const code =
    typeof err === 'object' && err !== null && 'code' in err ? /** @type {{ code?: string }} */ (err).code : undefined

  switch (code) {
    case 'P2002':
      res.status(409).json({ error: 'Un enregistrement avec ces données existe déjà' })
      return
    case 'P2025':
      res.status(404).json({ error: 'Enregistrement introuvable' })
      return
    default:
      if (code && /^P\d{4}$/.test(code) && typeof err.message === 'string') {
        logger.error(`Unhandled Prisma ${code}: ${err.message}`)
        res.status(400).json({ error: 'Erreur base de données', code })
        return
      }
      break
  }

  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : isPrismaKnownError(err)
          ? JSON.stringify(err)
          : String(err)

  logger.error(`Unhandled error: ${msg}\n${err instanceof Error ? err.stack ?? '' : ''}`)
  res.status(500).json({ error: 'Erreur serveur interne' })
}
