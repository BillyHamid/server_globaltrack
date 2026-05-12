import { Router, Request, Response, NextFunction } from 'express'
import { authenticate } from '../middleware/auth.middleware'

const router = Router()
router.use(authenticate)

// ─── Cache in-memory (TTL: 24h succès, 30s échec) ────────────────────────────
interface CacheEntry { value: unknown; exp: number }
const cache = new Map<string, CacheEntry>()

function getCached(key: string): unknown | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.exp) { cache.delete(key); return undefined }
  return entry.value
}

function setCached(key: string, value: unknown, success: boolean): void {
  const ttl = success ? 24 * 60 * 60 * 1000 : 30 * 1000
  cache.set(key, { value, exp: Date.now() + ttl })
}

/**
 * GET /api/tac/:imei
 * Interroge la base TAC d'IMEICheck avec des headers navigateur complets
 * pour contourner la protection Cloudflare.
 * Cache 24h en succès, 30s en échec.
 */
router.get('/:imei', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const imei = (req.params.imei ?? '').replace(/\D/g, '')
    if (imei.length !== 15) {
      res.status(400).json({ error: 'IMEI invalide (15 chiffres requis)' })
      return
    }

    const cacheKey = `tac:${imei}`
    const cached = getCached(cacheKey)
    if (cached !== undefined) {
      res.json(cached)
      return
    }

    const url = `https://alpha.imeicheck.com/api/modelBrandName?imei=${encodeURIComponent(imei)}&format=json`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    let upstream: globalThis.Response
    try {
      upstream = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'sec-ch-ua': '"Chromium";v="131", "Google Chrome";v="131", "Not_A Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-site': 'none',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-dest': 'document',
          'cache-control': 'no-cache',
          'pragma': 'no-cache',
          'Referer': 'https://alpha.imeicheck.com/',
        },
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!upstream.ok) {
      setCached(cacheKey, null, false)
      res.status(upstream.status).json({ error: 'TAC_LOOKUP_FAILED', status: upstream.status })
      return
    }

    const data: unknown = await upstream.json()
    setCached(cacheKey, data, true)
    res.json(data)
  } catch (err) {
    next(err)
  }
})

export default router
