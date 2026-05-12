import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { rateLimit } from 'express-rate-limit'

import { logger } from './lib/logger.js'
import { prisma, disconnectPrisma } from './lib/prisma.js'
import { errorHandler } from './middleware/error.middleware.js'

import authRouter from './routes/auth.routes.js'
import phonesRouter from './routes/phones.routes.js'
import clientsRouter from './routes/clients.routes.js'
import salesRouter from './routes/sales.routes.js'
import usersRouter from './routes/users.routes.js'
import imeiRouter from './routes/imei.routes.js'
import appleRouter from './routes/apple.routes.js'
import alertsRouter from './routes/alerts.routes.js'
import movementsRouter from './routes/movements.routes.js'
import dashboardRouter from './routes/dashboard.routes.js'
import tacRouter from './routes/tac.routes.js'
import sortiesRouter from './routes/sorties.routes.js'
import adminRouter from './routes/admin.routes.js'

const app = express()
const PORT = parseInt(process.env.PORT ?? '3001', 10)

app.use(helmet())
app.use(cors({
  origin: (origin, cb) => {
    const allowed = [
      'https://global-track-zeta.vercel.app',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5173',
      ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
    ]
    if (
      !origin ||
      allowed.includes(origin) ||
      origin.endsWith('.ngrok-free.dev') ||
      origin.endsWith('.vercel.app')
    ) {
      cb(null, true)
    } else {
      cb(new Error(`CORS: origin ${origin} non autorisée`))
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
}))

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans quelques minutes' },
}))

app.use(express.json({ limit: '12mb' }))
app.use(express.urlencoded({ extended: true }))

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev', { stream: { write: msg => logger.http(msg.trim()) } }))
}

app.use('/api/auth', authRouter)
app.use('/api/phones', phonesRouter)
app.use('/api/clients', clientsRouter)
app.use('/api/sales', salesRouter)
app.use('/api/users', usersRouter)
app.use('/api/imei', imeiRouter)
app.use('/api/apple', appleRouter)
app.use('/api/alerts', alertsRouter)
app.use('/api/movements', movementsRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/tac', tacRouter)
app.use('/api/sorties', sortiesRouter)
app.use('/api/admin', adminRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() })
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Route introuvable' })
})

app.use(errorHandler)

/** @type {import('http').Server | undefined} */
let server

async function gracefulShutdown(signal) {
  logger.info(`${signal} — arrêt en cours…`)
  await new Promise(resolve => {
    if (!server) {
      resolve()
      return
    }
    server.close(() => resolve())
  })
  await disconnectPrisma().catch(() => undefined)
  process.exit(0)
}

process.once('SIGTERM', () => void gracefulShutdown('SIGTERM'))
process.once('SIGINT', () => void gracefulShutdown('SIGINT'))

;(async () => {
  try {
    await prisma.$connect()
    logger.info('PostgreSQL : connexion établie')
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    logger.error(
      `Échec connexion PostgreSQL — vérifiez DATABASE_URL et que le serveur écoute. Détail : ${detail}`,
    )
    process.exit(1)
  }

  server = app.listen(PORT, () => {
    logger.info(`╔══════════════════════════════════════════╗`)
    logger.info(`║   GlobalTrack API  •  port ${PORT}           ║`)
    logger.info(`║   ENV: ${process.env.NODE_ENV ?? 'development'}                     ║`)
    logger.info(`╚══════════════════════════════════════════╝`)
  })

  server.on('error', err => {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'EADDRINUSE') {
      logger.error(
        `Impossible d'écouter le port ${PORT} : déjà utilisé (EADDRINUSE). ` +
          `Arrêtez l'autre instance du backend ou le processus qui occupe ce port, ` +
          `ou définissez PORT=3002 dans backend/.env puis relancez.`,
      )
      process.exit(1)
    }
    throw err
  })
})()

export default app
