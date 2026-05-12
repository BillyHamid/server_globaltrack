import axios, { AxiosError } from 'axios'
import { logger } from '../lib/logger.js'

const SICKW_URL = 'https://sickw.com/api.php'

export class SickwUnavailableError extends Error {
  constructor(message = 'Le serveur SickW ne répond pas ou la requête a expiré') {
    super(message)
    this.name = 'SickwUnavailableError'
  }
}

export class SickwConfigError extends Error {
  constructor(message = 'SICKW_API_KEY non configurée') {
    super(message)
    this.name = 'SickwConfigError'
  }
}

/**
 * Appel HTTP SickW (format=beta → JSON structuré).
 */
export async function requestSickwCheck(imei, serviceId) {
  const apiKey = process.env.SICKW_API_KEY?.trim()
  if (!apiKey) throw new SickwConfigError()

  const cleanImei = imei.replace(/\s|-/g, '').trim()

  try {
    const { data } = await axios.get(SICKW_URL, {
      params: {
        format: 'beta',
        key: apiKey,
        imei: cleanImei,
        service: serviceId,
      },
      timeout: 25_000,
      headers: { Accept: 'application/json, text/plain, */*' },
    })
    return data ?? {}
  } catch (err) {
    const detail = err instanceof AxiosError ? err.message : String(err)
    logger.warn(`SickW: échec de requête (${detail})`)
    throw new SickwUnavailableError()
  }
}
