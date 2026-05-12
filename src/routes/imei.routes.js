import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.middleware.js'
import { validateIMEI, quickValidateIMEI } from '../services/imei.service.js'
import {
  requestSickwCheck,
  SickwConfigError,
  SickwUnavailableError,
} from '../services/sickw.service.js'

const router = Router()
router.use(authenticate)

router.get('/check/:imei', async (req, res, next) => {
  try {
    const { imei } = req.params
    const { blacklist, excludeId } = req.query

    const result = await validateIMEI(imei, {
      checkBlacklist: blacklist === 'true',
      excludePhoneId: excludeId,
    })

    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.post('/check', async (req, res, next) => {
  try {
    const schema = z.object({
      imei: z.string().min(1),
      checkBlacklist: z.boolean().optional().default(false),
      excludePhoneId: z.string().optional(),
    })
    const { imei, checkBlacklist, excludePhoneId } = schema.parse(req.body)

    const result = await validateIMEI(imei, { checkBlacklist, excludePhoneId })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.get('/quick/:imei', (_req, res, next) => {
  try {
    const { imei } = _req.params
    res.json(quickValidateIMEI(imei))
  } catch (err) {
    next(err)
  }
})

const sickwBodySchema = z.object({
  imei: z.string().min(10, "L'IMEI doit contenir au moins 10 caractères"),
  serviceId: z.union([z.string(), z.number()]).optional(),
})

router.post('/sickw', async (req, res, next) => {
  try {
    const { imei, serviceId: bodyServiceId } = sickwBodySchema.parse(req.body)
    const envServiceId = process.env.SICKW_SERVICE_ID?.trim()
    const resolved =
      bodyServiceId !== undefined && String(bodyServiceId).trim() !== ''
        ? bodyServiceId
        : envServiceId
    if (!resolved || String(resolved).trim() === '') {
      return res.status(500).json({
        success: false,
        message:
          'SICKW_SERVICE_ID non configuré sur le serveur (ou renseignez serviceId dans le corps de la requête)',
      })
    }

    const raw = await requestSickwCheck(imei, resolved)

    if (raw.status !== 'success' || raw.result == null || typeof raw.result !== 'object') {
      const msg =
        typeof raw.message === 'string' && raw.message.trim().length > 0
          ? raw.message
          : 'Erreur API SickW'
      return res.status(400).json({ success: false, message: msg })
    }

    const result = /** @type {Record<string, unknown>} */ (raw.result)
    const modelVal = result['Model Name']
    const brandVal = result['Manufacturer']

    res.json({
      success: true,
      model: typeof modelVal === 'string' ? modelVal : modelVal != null ? String(modelVal) : null,
      brand: typeof brandVal === 'string' ? brandVal : brandVal != null ? String(brandVal) : null,
      status: raw.status,
      result,
    })
  } catch (err) {
    if (err instanceof SickwUnavailableError) {
      return res.status(500).json({ success: false, message: err.message })
    }
    if (err instanceof SickwConfigError) {
      return res.status(500).json({ success: false, message: err.message })
    }
    next(err)
  }
})

export default router
