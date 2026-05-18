import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { requestSickwCheck, SickwConfigError, SickwUnavailableError } from '../services/sickw.service.js'

const router = Router()
router.use(authenticate)

router.post('/', async (req, res, next) => {
  try {
    const serialNumber = req.body?.serialNumber?.trim()
    if (!serialNumber || serialNumber.length < 4 || serialNumber.length > 20) {
      res.status(400).json({ error: 'Numéro de série invalide' })
      return
    }

    let raw
    try {
      raw = await requestSickwCheck(serialNumber, 30) // APPLE BASIC INFO
    } catch {
      raw = await requestSickwCheck(serialNumber, 26) // Fallback: APPLE SERIAL INFO
    }

    if (raw.status !== 'success' || !raw.result || typeof raw.result !== 'object') {
      const msg = typeof raw.message === 'string' ? raw.message : 'Erreur API SickW'
      return res.status(400).json({ error: msg })
    }

    const result = raw.result
    res.json({
      brand: 'Apple',
      model: result['Model Name'] ?? result['Model'] ?? 'Inconnu',
      capacity: result['Model Capacity'] ?? result['Storage'] ?? 'N/A',
    })
  } catch (err) {
    if (err instanceof SickwUnavailableError || err instanceof SickwConfigError) {
      return res.status(500).json({ error: err.message })
    }
    next(err)
  }
})

export default router
