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
export interface IMEICheckResult {
    valid: boolean;
    imei: string;
    format: {
        ok: boolean;
        error?: string;
    };
    luhn: {
        ok: boolean;
        error?: string;
    };
    tac: {
        ok: boolean;
        brand?: string;
        model?: string;
        marketingName?: string;
        manufacturer?: string;
        source: 'api' | 'local' | 'none';
    };
    blacklist: {
        checked: boolean;
        clean?: boolean;
        status?: string;
    };
    uniqueness: {
        isUnique: boolean;
        duplicatePhoneId?: string;
    };
    errors: string[];
    warnings: string[];
}
export declare function validateIMEI(imei: string, options?: {
    checkBlacklist?: boolean;
    excludePhoneId?: string;
}): Promise<IMEICheckResult>;
export declare function quickValidateIMEI(imei: string): {
    valid: boolean;
    error?: string;
};
//# sourceMappingURL=imei.service.d.ts.map