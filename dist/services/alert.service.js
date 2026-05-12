"use strict";
/**
 * Service de gestion des alertes automatiques
 *
 * Génère des alertes pour :
 * - credit_retard : ventes crédit dont la date d'échéance est dépassée
 * - stock_ancien  : téléphones disponibles depuis plus de 60 jours
 * - incoherence   : téléphone marqué "disponible" mais ayant une vente active
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshAlerts = refreshAlerts;
const prisma_1 = require("../lib/prisma");
const STOCK_AGE_DAYS = 60;
async function refreshAlerts() {
    const now = new Date();
    // ─── Crédits en retard ────────────────────────────────────────────────────
    const overdueCredits = await prisma_1.prisma.sale.findMany({
        where: {
            type: 'credit',
            paymentStatus: { not: 'paye' },
            dueDate: { lt: now },
        },
        include: { client: true, phone: true },
    });
    for (const sale of overdueCredits) {
        const existing = await prisma_1.prisma.alert.findFirst({
            where: { type: 'credit_retard', relatedId: sale.id, status: { not: 'resolue' } },
        });
        if (!existing) {
            await prisma_1.prisma.alert.create({
                data: {
                    type: 'credit_retard',
                    title: `Crédit en retard — ${sale.client.name}`,
                    description: `Vente crédit du ${sale.date.toLocaleDateString('fr-FR')} (${sale.phone.brand} ${sale.phone.model}) — échéance dépassée le ${sale.dueDate.toLocaleDateString('fr-FR')}. Restant : ${sale.remainingAmount.toLocaleString('fr-FR')} FC`,
                    relatedId: sale.id,
                },
            });
        }
    }
    // ─── Stock ancien ─────────────────────────────────────────────────────────
    const cutoff = new Date(now.getTime() - STOCK_AGE_DAYS * 24 * 60 * 60 * 1000);
    const oldStock = await prisma_1.prisma.phone.findMany({
        where: { status: 'disponible', addedAt: { lt: cutoff } },
    });
    for (const phone of oldStock) {
        const existing = await prisma_1.prisma.alert.findFirst({
            where: { type: 'stock_ancien', relatedId: phone.id, status: { not: 'resolue' } },
        });
        if (!existing) {
            const days = Math.floor((now.getTime() - phone.addedAt.getTime()) / (24 * 60 * 60 * 1000));
            await prisma_1.prisma.alert.create({
                data: {
                    type: 'stock_ancien',
                    title: `Stock ancien — ${phone.brand} ${phone.model}`,
                    description: `${phone.brand} ${phone.model} (IMEI: ${phone.imei}) est en stock depuis ${days} jours sans être vendu.`,
                    relatedId: phone.id,
                },
            });
        }
    }
    // ─── Incohérences ─────────────────────────────────────────────────────────
    const activeSales = await prisma_1.prisma.sale.findMany({
        where: { paymentStatus: { not: 'paye' } },
        include: { phone: true },
    });
    for (const sale of activeSales) {
        if (sale.phone.status === 'disponible') {
            const existing = await prisma_1.prisma.alert.findFirst({
                where: { type: 'incoherence', relatedId: sale.phoneId, status: { not: 'resolue' } },
            });
            if (!existing) {
                await prisma_1.prisma.alert.create({
                    data: {
                        type: 'incoherence',
                        title: `Incohérence stock — ${sale.phone.brand} ${sale.phone.model}`,
                        description: `Le téléphone ${sale.phone.brand} ${sale.phone.model} (IMEI: ${sale.phone.imei}) est marqué "disponible" alors qu'une vente active (ID: ${sale.id}) existe.`,
                        relatedId: sale.phoneId,
                    },
                });
            }
        }
    }
    // Résoudre automatiquement les alertes crédit_retard dont le crédit est soldé
    const resolvedSaleIds = (await prisma_1.prisma.sale.findMany({ where: { paymentStatus: 'paye' }, select: { id: true } })).map(s => s.id);
    if (resolvedSaleIds.length) {
        await prisma_1.prisma.alert.updateMany({
            where: { type: 'credit_retard', relatedId: { in: resolvedSaleIds }, status: { not: 'resolue' } },
            data: { status: 'resolue' },
        });
    }
    // ─── Sorties — 48 h dépassées (téléphone emprunté pour essai / vente) ─────
    const overdueExits = await prisma_1.prisma.phoneExit.findMany({
        where: { status: 'en_cours', dueAt: { lt: now } },
        include: { phone: true },
    });
    for (const exit of overdueExits) {
        const existing = await prisma_1.prisma.alert.findFirst({
            where: { type: 'sortie_echeance', relatedId: exit.id, status: { not: 'resolue' } },
        });
        if (!existing) {
            await prisma_1.prisma.alert.create({
                data: {
                    type: 'sortie_echeance',
                    title: `Sortie — délai 48 h dépassé — ${exit.personName}`,
                    description: `${exit.personName} a pris le ${exit.phone.brand} ${exit.phone.model} (IMEI: ${exit.phone.imei}) pour : « ${exit.motif} ». ` +
                        `Les 48 heures sont écoulées : **contacter cette personne pour qu’elle ramène l’appareil.**`,
                    relatedId: exit.id,
                },
            });
        }
    }
    const returnedExitRows = await prisma_1.prisma.phoneExit.findMany({
        where: { status: 'retournee' },
        select: { id: true },
    });
    const returnedExitIds = returnedExitRows.map((row) => row.id);
    if (returnedExitIds.length) {
        await prisma_1.prisma.alert.updateMany({
            where: { type: 'sortie_echeance', relatedId: { in: returnedExitIds }, status: { not: 'resolue' } },
            data: { status: 'resolue' },
        });
    }
    const count = await prisma_1.prisma.alert.count({ where: { status: 'nouvelle' } });
    return count;
}
//# sourceMappingURL=alert.service.js.map