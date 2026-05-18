import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { rateLimit } from 'express-rate-limit'

import { logger } from './lib/logger.js'
import { prisma, disconnectPrisma } from './lib/prisma.js'
import { errorHandler } from './middleware/error.middleware.js'

// Routes
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

/* =========================
   SECURITY
========================= */
app.use(helmet())

/* =========================
   CORS FIX (IMPORTANT)
========================= */
const allowedOrigins = [
  'https://globaltrack.cloud',
  'https://www.globaltrack.cloud',
]

app.use(cors({
  origin: function (origin, callback) {
    // Allow mobile apps / postman
    if (!origin) return callback(null, true)

    // Allow whitelist
    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    // DEBUG MODE (évite blocage en prod pendant test)
    return callback(null, true)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'ngrok-skip-browser-warning' // 🔥 FIX TON ERREUR
  ],
  exposedHeaders: ['Content-Disposition']
}))

/* =========================
   RATE LIMIT
========================= */
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez plus tard' },
}))

/* =========================
   BODY PARSER
========================= */
app.use(express.json({ limit: '12mb' }))
app.use(express.urlencoded({ extended: true }))

/* =========================
   LOGGING
========================= */
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev', {
    stream: {
      write: msg => logger.http(msg.trim())
    }
  }))
}

/* =========================
   ROUTES
========================= */
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

/* =========================
   HEALTH CHECK
========================= */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  })
})

/* =========================
   404 HANDLER
========================= */
app.use((_req, res) => {
  res.status(404).json({
    error: 'Route introuvable'
  })
})

/* =========================
   ERROR HANDLER
========================= */
app.use(errorHandler)

/* =========================
   GRACEFUL SHUTDOWN
========================= */
let server

async function gracefulShutdown(signal) {
  logger.info(`${signal} — arrêt serveur...`)

  await new Promise(resolve => {
    if (!server) return resolve()
    server.close(() => resolve())
  })

  await disconnectPrisma().catch(() => {})
  process.exit(0)
}

process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.once('SIGINT', () => gracefulShutdown('SIGINT'))

/* =========================
   START SERVER
========================= */
;(async () => {
  try {
    await prisma.$connect()
    logger.info('PostgreSQL connecté')
  } catch (err) {
    logger.error('Erreur connexion PostgreSQL:', err.message)
    process.exit(1)
  }

  server = app.listen(PORT, () => {
    logger.info(`🚀 GlobalTrack API running on port ${PORT}`)
    logger.info(`ENV: ${process.env.NODE_ENV ?? 'development'}`)
  })

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${PORT} déjà utilisé`)
      process.exit(1)
    }
    throw err
  })
})()

export default app