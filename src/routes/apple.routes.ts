import { Router, Request, Response as ExpressResponse, NextFunction } from 'express'
import { authenticate } from '../middleware/auth.middleware'

const router = Router()
router.use(authenticate)

// ─── Cache in-memory (TTL: 1h succès, 60s échec) ─────────────────────────────
interface CacheEntry { body: string; status: number; exp: number }
const cache = new Map<string, CacheEntry>()

function getCached(key: string): CacheEntry | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.exp) { cache.delete(key); return undefined }
  return entry
}

function setCached(key: string, status: number, body: string): void {
  const ttl = status < 400 ? 60 * 60 * 1000 : 60 * 1000
  cache.set(key, { body, status, exp: Date.now() + ttl })
}

/**
 * Proxy vers Reincubate DeviceIdentifier API (lookup v2).
 * Token optionnel : mode anonyme limité ; avec RI_DEVID_TOKEN, quotas Reincubate.
 * @see https://reincubate.com/support/deviceidentifier/lookup-identification-and-enrichment/
 */
router.get('/:identifier', async (req: Request, res: ExpressResponse, next: NextFunction) => {
  try {
    const raw = req.params.identifier?.trim() ?? ''
    if (!raw || raw.length > 64) {
      res.status(400).json({ error: 'Identifiant invalide' })
      return
    }

    // Serve from cache if available
    const cacheKey = `apple:${raw.toLowerCase()}`
    const hit = getCached(cacheKey)
    if (hit) {
      res.status(hit.status).type('application/json').send(hit.body)
      return
    }

    const token = process.env.RI_DEVID_TOKEN?.trim()
    const url = `https://di-api.reincubate.com/v2/lookup/${encodeURIComponent(raw)}/`
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'GlobalTrack/1.0 (inventory)',
    }
    if (token) {
      headers.Authorization = `Token ${token}`
    }

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 14_000)
    let upstream: globalThis.Response
    try {
      upstream = await fetch(url, { headers, signal: controller.signal })
    } finally {
      clearTimeout(t)
    }

    const text = await upstream.text()
    if (!upstream.ok) {
      let detail: unknown = text.slice(0, 500)
      try { detail = JSON.parse(text) } catch { /* garde le texte brut */ }
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
