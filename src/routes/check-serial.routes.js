import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'

const router = Router()
router.use(authenticate)

async function callSickW(serialNumber, service) {
  const key = process.env.SICKW_API_KEY?.trim()
  if (!key) throw new Error('SICKW_API_KEY non configurée')

  const url = `https://sickw.com/api.php?format=beta&key=${key}&imei=${encodeURIComponent(serialNumber)}&service=${service}`

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 15_000)
  let res
  try {
    res = await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(t)
  }

  if (!res.ok) throw new Error(`SickW HTTP ${res.status}`)

  const data = await res.json()
  if (data.status === 'error' || !data.result || typeof data.result !== 'object') {
    throw new Error(typeof data.result === 'string' ? data.result : 'SickW: résultat invalide')
  }

  return data.result
}

router.post('/', async (req, res, next) => {
  try {
    const serialNumber = req.body?.serialNumber?.trim()
    if (!serialNumber || serialNumber.length < 4 || serialNumber.length > 20) {
      res.status(400).json({ error: 'Numéro de série invalide' })
      return
    }

    let result
    try {
      // Service 30 — APPLE BASIC INFO (iPhone, iPad, Watch, Mac récents)
      result = await callSickW(serialNumber, 30)
    } catch {
      // Fallback service 26 — APPLE SERIAL INFO (vieux Mac)
      result = await callSickW(serialNumber, 26)
    }

    res.json({
      brand: 'Apple',
      model: result['Model Name'] ?? result['Model'] ?? 'Inconnu',
      capacity: result['Model Capacity'] ?? result['Storage'] ?? 'N/A',
    })
  } catch (err) {
    next(err)
  }
})

export default router
