/**
 * Service de gestion des alertes automatiques
 *
 * Optimisations :
 * - Mutex refreshInFlight : une seule exécution simultanée possible
 * - Chargement de toutes les données source + alertes actives en parallèle (Promise.all)
 * - Index en mémoire (Set) pour éviter les findFirst répétitifs en boucle
 * - createMany groupé au lieu de create() unitaires
 * - Résolutions parallèles via Promise.all
 */

import { prisma } from '../lib/prisma.js'

const STOCK_AGE_DAYS = 60
/** @type {Promise<number> | null} */
let refreshInFlight = null

export async function refreshAlerts() {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const now = new Date()
    const cutoff = new Date(now.getTime() - STOCK_AGE_DAYS * 86_400_000)

    const [
      overdueCredits,
      oldStock,
      activeSalesWithPhone,
      paidSaleIds,
      overdueExits,
      returnedExitRows,
      existingAlerts,
    ] = await Promise.all([
      prisma.sale.findMany({
        where: { type: 'credit', paymentStatus: { not: 'paye' }, dueDate: { lt: now } },
        select: {
          id: true,
          date: true,
          dueDate: true,
          remainingAmount: true,
          client: { select: { name: true } },
          phone: { select: { brand: true, model: true } },
        },
      }),
      prisma.phone.findMany({
        where: { status: 'disponible', addedAt: { lt: cutoff } },
        select: { id: true, brand: true, model: true, imei: true, addedAt: true },
      }),
      prisma.sale.findMany({
        where: { paymentStatus: { not: 'paye' } },
        select: {
          id: true,
          phoneId: true,
          phone: { select: { status: true, brand: true, model: true, imei: true } },
        },
      }),
      prisma.sale.findMany({ where: { paymentStatus: 'paye' }, select: { id: true } }),
      prisma.phoneExit.findMany({
        where: { status: 'en_cours', dueAt: { lt: now } },
        select: {
          id: true,
          personName: true,
          motif: true,
          phone: { select: { brand: true, model: true, imei: true } },
        },
      }),
      prisma.phoneExit.findMany({ where: { status: 'retournee' }, select: { id: true } }),
      prisma.alert.findMany({ where: { status: { not: 'resolue' } }, select: { type: true, relatedId: true } }),
    ])

    const alertSet = new Set(existingAlerts.map(a => `${a.type}:${a.relatedId}`))

    const creditInserts = overdueCredits
      .filter(s => !alertSet.has(`credit_retard:${s.id}`))
      .map(s => ({
        type: 'credit_retard',
        title: `Crédit en retard — ${s.client.name}`,
        description: `Vente crédit du ${s.date.toLocaleDateString('fr-FR')} (${s.phone.brand} ${s.phone.model}) — échéance dépassée le ${s.dueDate?.toLocaleDateString('fr-FR')}. Restant : ${s.remainingAmount.toLocaleString('fr-FR')} FC`,
        relatedId: s.id,
      }))

    const stockInserts = oldStock
      .filter(p => !alertSet.has(`stock_ancien:${p.id}`))
      .map(p => {
        const days = Math.floor((now.getTime() - new Date(p.addedAt).getTime()) / 86_400_000)
        return {
          type: 'stock_ancien',
          title: `Stock ancien — ${p.brand} ${p.model}`,
          description: `${p.brand} ${p.model} (IMEI: ${p.imei}) est en stock depuis ${days} jours sans être vendu.`,
          relatedId: p.id,
        }
      })

    const incoherenceInserts = activeSalesWithPhone
      .filter(s => s.phone.status === 'disponible' && !alertSet.has(`incoherence:${s.phoneId}`))
      .map(s => ({
        type: 'incoherence',
        title: `Incohérence stock — ${s.phone.brand} ${s.phone.model}`,
        description: `Le téléphone ${s.phone.brand} ${s.phone.model} (IMEI: ${s.phone.imei}) est marqué "disponible" alors qu'une vente active (ID: ${s.id}) existe.`,
        relatedId: s.phoneId,
      }))

    const sortieInserts = overdueExits
      .filter(e => !alertSet.has(`sortie_echeance:${e.id}`))
      .map(e => ({
        type: 'sortie_echeance',
        title: `Sortie — délai 48 h dépassé — ${e.personName}`,
        description:
          `${e.personName} a pris le ${e.phone.brand} ${e.phone.model} (IMEI: ${e.phone.imei}) pour : « ${e.motif} ». ` +
          `Les 48 heures sont écoulées : contacter cette personne pour qu'elle ramène l'appareil.`,
        relatedId: e.id,
      }))

    const allInserts = [...creditInserts, ...stockInserts, ...incoherenceInserts, ...sortieInserts]
    const resolvedPaidIds = paidSaleIds.map(s => s.id)
    const resolvedExitIds = returnedExitRows.map(r => r.id)

    await Promise.all([
      allInserts.length > 0
        ? prisma.alert.createMany({ data: allInserts, skipDuplicates: true })
        : Promise.resolve(),
      resolvedPaidIds.length > 0
        ? prisma.alert.updateMany({
            where: { type: 'credit_retard', relatedId: { in: resolvedPaidIds }, status: { not: 'resolue' } },
            data: { status: 'resolue' },
          })
        : Promise.resolve(),
      resolvedExitIds.length > 0
        ? prisma.alert.updateMany({
            where: { type: 'sortie_echeance', relatedId: { in: resolvedExitIds }, status: { not: 'resolue' } },
            data: { status: 'resolue' },
          })
        : Promise.resolve(),
    ])

    const count = await prisma.alert.count({ where: { status: 'nouvelle' } })
    return count
  })()

  try {
    return await refreshInFlight
  } finally {
    refreshInFlight = null
  }
}
