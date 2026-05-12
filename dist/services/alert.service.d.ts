/**
 * Service de gestion des alertes automatiques
 *
 * Génère des alertes pour :
 * - credit_retard : ventes crédit dont la date d'échéance est dépassée
 * - stock_ancien  : téléphones disponibles depuis plus de 60 jours
 * - incoherence   : téléphone marqué "disponible" mais ayant une vente active
 */
export declare function refreshAlerts(): Promise<number>;
//# sourceMappingURL=alert.service.d.ts.map