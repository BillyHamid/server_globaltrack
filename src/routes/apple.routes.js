import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'

const router = Router()
router.use(authenticate)

/** @type {Map<string, { body: string; status: number; exp: number }>} */
const cache = new Map()

function getCached(key) {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.exp) {
    cache.delete(key)
    return undefined
  }
  return entry
}

function setCached(key, status, body) {
  const ttl = status < 400 ? 60 * 60 * 1000 : 60 * 1000
  cache.set(key, { body, status, exp: Date.now() + ttl })
}

router.get('/:identifier', async (req, res, next) => {
  try {
    const raw = req.params.identifier?.trim() ?? ''
    if (!raw || raw.length > 64) {
      res.status(400).json({ error: 'Identifiant invalide' })
      return
    }

    const cacheKey = `apple:${raw.toLowerCase()}`
    const hit = getCached(cacheKey)
    if (hit) {
      res.status(hit.status).type('application/json').send(hit.body)
      return
    }

    const token = process.env.RI_DEVID_TOKEN?.trim()
    const url = `https://di-api.reincubate.com/v2/lookup/${encodeURIComponent(raw)}/`
    const headers = {
      Accept: 'application/json',
      'User-Agent': 'GlobalTrack/1.0 (inventory)',
    }
    if (token) {
      headers.Authorization = `Token ${token}`
    }

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 14_000)
    let upstream
    try {
      upstream = await fetch(url, { headers, signal: controller.signal })
    } finally {
      clearTimeout(t)
    }

    const text = await upstream.text()
    if (!upstream.ok) {
      let detail = text.slice(0, 500)
      try {
        detail = JSON.parse(text)
      } catch {
        /* garde le texte brut */
      }
      const status = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502
      const body = JSON.stringify({ error: 'APPLE_LOOKUP_FAILED', status: upstream.status, detail })
      setCached(cacheKey, status, body)
      res.status(status).type('application/json').send(body)
      return
    }

    setCached(cacheKey, 200, text)
    res.type('application/json').send(text)
  } catch (err) {
    next(err)
  }
})

export default router
