/**
 * Service de validation IMEI multi-couches
 *
 * Couche 1 — Format      : 15 chiffres, structure TTTTTTTSSSSSSSC
 * Couche 2 — Luhn        : algorithme checksum standard GSMA
 * Couche 3 — TAC/Device  : imei.info API v4 (450+ paramètres, MàJ hebdo)
 *                          Fallback : base TAC locale embarquée
 * Couche 4 — Blacklist   : imei.info GSMA blacklist check (optionnel)
 * Couche 5 — Unicité     : vérification en base de données
 *
 * API recommandée : https://imei.info/api/
 *   - Plus grande base TAC mondiale (450+ paramètres)
 *   - Mises à jour hebdomadaires
 *   - Blacklist GSMA intégrée
 *   - ~0.10 USD / requête, essai gratuit disponible
 */

import axios from 'axios'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'

export interface IMEICheckResult {
  valid: boolean
  imei: string
  format: { ok: boolean; error?: string }
  luhn:   { ok: boolean; error?: string }
  tac: {
    ok: boolean
    brand?: string
    model?: string
    marketingName?: string
    manufacturer?: string
    source: 'api' | 'local' | 'none'
  }
  blacklist: {
    checked: boolean
    clean?: boolean
    status?: string
  }
  uniqueness: {
    isUnique: boolean
    duplicatePhoneId?: string
  }
  errors: string[]
  warnings: string[]
}

// ─── Couche 1 — Format ────────────────────────────────────────────────────────
function checkFormat(imei: string): { ok: boolean; error?: string } {
  const clean = imei.replace(/\s|-/g, '')
  if (!/^\d{15}$/.test(clean)) {
    return { ok: false, error: `L'IMEI doit contenir exactement 15 chiffres (reçu : ${clean.length} chars)` }
  }
  return { ok: true }
}

// ─── Couche 2 — Luhn ─────────────────────────────────────────────────────────
function checkLuhn(imei: string): { ok: boolean; error?: string } {
  let sum = 0
  for (let i = 0; i < 15; i++) {
    let d = parseInt(imei[i], 10)
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9 }
    sum += d
  }
  if (sum % 10 !== 0) {
    return { ok: false, error: 'Checksum Luhn invalide — IMEI possiblement falsifié' }
  }
  return { ok: true }
}

// ─── Couche 3 — TAC via IMEICheck.com (gratuit, sans clé) ────────────────────
// Docs : https://imeicheck.com/imei-tac-database-info/
interface IMEICheckResponse {
  object?: { brand?: string; model?: string; name?: string }
  brand?: string
  model?: string
  name?: string
}

async function fetchTACFromIMEICheck(imei: string): Promise<{
  ok: boolean
  data?: { brand: string; model: string; marketingName?: string }
  error?: string
}> {
  try {
    const url = `https://alpha.imeicheck.com/api/modelBrandName?imei=${encodeURIComponent(imei)}&format=json`
    const res = await axios.get<IMEICheckResponse>(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
    })

    const obj = res.data?.object ?? res.data
    const brand = (obj?.brand ?? '').trim()
    const marketingName = (obj?.name ?? '').trim()
    const model = marketingName || (obj?.model ?? '').trim()

    if (!brand && !model) return { ok: false, error: 'Appareil non reconnu par IMEICheck' }
    return { ok: true, data: { brand: brand || 'Inconnu', model, marketingName } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`IMEICheck.com TAC error for ${imei}: ${msg}`)
    return { ok: false, error: msg }
  }
}

// ─── Couche 3 fallback — imei.info API (optionnel, clé requise) ───────────────
async function fetchTACFromImeiInfo(imei: string): Promise<{
  ok: boolean
  data?: { brand: string; model: string; marketingName?: string; manufacturer?: string }
  error?: string
}> {
  const apiKey = process.env.IMEI_INFO_API_KEY
  if (!apiKey) return { ok: false, error: 'IMEI_INFO_API_KEY non configurée' }

  try {
    const res = await axios.get('https://apiv4.imei.info/', {
      params: { key: apiKey, action: 'modelBrandName', imei },
      timeout: 8000,
    })
    if (res.data?.status === 'success' || res.data?.brand) {
      return { ok: true, data: res.data }
    }
    return { ok: false, error: res.data?.message ?? 'Réponse API inattendue' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`imei.info API error for ${imei}: ${msg}`)
    return { ok: false, error: msg }
  }
}

// ─── Couche 3 fallback — Base TAC locale ─────────────────────────────────────
// TAC (8 premiers chiffres) → marque + modèle
const LOCAL_TAC_DB: Record<string, { brand: string; model: string }> = {
  // Apple iPhone
  '35953408': { brand: 'Apple', model: 'iPhone 15 Pro Max' },
  '35326211': { brand: 'Apple', model: 'iPhone 15 Pro' },
  '35761611': { brand: 'Apple', model: 'iPhone 15 Plus' },
  '35470211': { brand: 'Apple', model: 'iPhone 15' },
  '35441411': { brand: 'Apple', model: 'iPhone 14 Pro Max' },
  '35280411': { brand: 'Apple', model: 'iPhone 14 Pro' },
  '35384711': { brand: 'Apple', model: 'iPhone 14' },
  '35352210': { brand: 'Apple', model: 'iPhone 13 Pro Max' },
  '35371010': { brand: 'Apple', model: 'iPhone 13 Pro' },
  '35473210': { brand: 'Apple', model: 'iPhone 13' },
  '35291110': { brand: 'Apple', model: 'iPhone SE (2022)' },
  // Samsung Galaxy
  '35463011': { brand: 'Samsung', model: 'Galaxy S24 Ultra' },
  '35233211': { brand: 'Samsung', model: 'Galaxy S24+' },
  '35671511': { brand: 'Samsung', model: 'Galaxy S24' },
  '35399410': { brand: 'Samsung', model: 'Galaxy S23 Ultra' },
  '35192610': { brand: 'Samsung', model: 'Galaxy S23+' },
  '35640610': { brand: 'Samsung', model: 'Galaxy S23' },
  '35248112': { brand: 'Samsung', model: 'Galaxy Z Fold 5' },
  '35611812': { brand: 'Samsung', model: 'Galaxy Z Flip 5' },
  '35342012': { brand: 'Samsung', model: 'Galaxy A54' },
  '35480512': { brand: 'Samsung', model: 'Galaxy A34' },
  // Xiaomi
  '86892105': { brand: 'Xiaomi', model: 'Redmi Note 13 Pro+' },
  '86604205': { brand: 'Xiaomi', model: 'Xiaomi 14 Ultra' },
  // Tecno
  '35901211': { brand: 'Tecno', model: 'Spark 20 Pro' },
  '35700211': { brand: 'Tecno', model: 'Camon 30 Premier' },
}

function lookupLocalTAC(imei: string): { brand: string; model: string } | null {
  const tac = imei.substring(0, 8)
  return LOCAL_TAC_DB[tac] ?? null
}

// ─── Couche 4 — Blacklist GSMA via imei.info ──────────────────────────────────
async function checkBlacklist(imei: string): Promise<{
  checked: boolean
  clean?: boolean
  status?: string
}> {
  const apiKey = process.env.IMEI_INFO_API_KEY
  if (!apiKey) return { checked: false }

  try {
    const res = await axios.get('https://apiv4.imei.info/', {
      params: { key: apiKey, action: 'gsmaBlacklist', imei },
      timeout: 8000,
    })
    const status: string = res.data?.gsmaBlacklist ?? res.data?.status ?? 'unknown'
    return {
      checked: true,
      clean: status.toLowerCase().includes('clean') || status === '0',
      status,
    }
  } catch {
    return { checked: false }
  }
}

// ─── Couche 5 — Unicité en base ───────────────────────────────────────────────
async function checkUniqueness(imei: string, excludeId?: string): Promise<{
  isUnique: boolean
  duplicatePhoneId?: string
}> {
  const existing = await prisma.phone.findUnique({ where: { imei } })
  if (!existing) return { isUnique: true }
  if (excludeId && existing.id === excludeId) return { isUnique: true }
  return { isUnique: false, duplicatePhoneId: existing.id }
}

// ─── Point d'entrée principal ─────────────────────────────────────────────────
export async function validateIMEI(
  imei: string,
  options: { checkBlacklist?: boolean; excludePhoneId?: string } = {},
): Promise<IMEICheckResult> {
  const clean = imei.replace(/\s|-/g, '')
  const errors: string[] = []
  const warnings: string[] = []

  // Couche 1 — Format
  const format = checkFormat(clean)
  if (!format.ok) errors.push(format.error!)

  // Couche 2 — Luhn (seulement si format OK)
  const luhn = format.ok ? checkLuhn(clean) : { ok: false, error: 'Format invalide' }
  if (format.ok && !luhn.ok) errors.push(luhn.error!)

  // Couche 3 — TAC / Device info
  // Note : IMEICheck.com est appelé côté navigateur (proxy Vite) car Cloudflare bloque Node.js
  // Ici : imei.info API (si clé configurée) ou base TAC locale
  let tac: IMEICheckResult['tac'] = { ok: false, source: 'none' }
  if (format.ok) {
    const imeiInfoResult = await fetchTACFromImeiInfo(clean)
    if (imeiInfoResult.ok && imeiInfoResult.data) {
      tac = {
        ok: true,
        brand: imeiInfoResult.data.brand,
        model: imeiInfoResult.data.model,
        marketingName: imeiInfoResult.data.marketingName,
        source: 'api',
      }
    } else {
      const local = lookupLocalTAC(clean)
      if (local) {
        tac = { ok: true, brand: local.brand, model: local.model, source: 'local' }
        warnings.push('Informations appareil issues de la base TAC locale')
      } else {
        tac = { ok: false, source: 'none' }
        warnings.push('Appareil non reconnu dans la base TAC (IMEI peut tout de même être valide)')
      }
    }
  }

  // Couche 4 — Blacklist (optionnel, coûte une requête API)
  let blacklist: IMEICheckResult['blacklist'] = { checked: false }
  if (options.checkBlacklist && format.ok) {
    blacklist = await checkBlacklist(clean)
    if (blacklist.checked && !blacklist.clean) {
      errors.push(`IMEI signalé sur liste noire GSMA (statut : ${blacklist.status})`)
    }
  }

  // Couche 5 — Unicité
  const uniqueness = await checkUniqueness(clean, options.excludePhoneId)
  if (!uniqueness.isUnique) {
    errors.push(`Cet IMEI est déjà enregistré dans le stock (téléphone #${uniqueness.duplicatePhoneId})`)
  }

  const valid = errors.length === 0

  return { valid, imei: clean, format, luhn, tac, blacklist, uniqueness, errors, warnings }
}

// ─── Validation rapide synchrone (format + Luhn uniquement) ──────────────────
export function quickValidateIMEI(imei: string): { valid: boolean; error?: string } {
  const clean = imei.replace(/\s|-/g, '')
  const fmt = checkFormat(clean)
  if (!fmt.ok) return { valid: false, error: fmt.error }
  const luhn = checkLuhn(clean)
  if (!luhn.ok) return { valid: false, error: luhn.error }
  return { valid: true }
}
