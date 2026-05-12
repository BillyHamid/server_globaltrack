"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_middleware_1 = require("../middleware/auth.middleware");
const imei_service_1 = require("../services/imei.service");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// GET /api/imei/check/:imei   — validation complète (format + Luhn + TAC + unicité)
router.get('/check/:imei', async (req, res, next) => {
    try {
        const { imei } = req.params;
        const { blacklist, excludeId } = req.query;
        const result = await (0, imei_service_1.validateIMEI)(imei, {
            checkBlacklist: blacklist === 'true',
            excludePhoneId: excludeId,
        });
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
// POST /api/imei/check   — body { imei, checkBlacklist?, excludePhoneId? }
router.post('/check', async (req, res, next) => {
    try {
        const schema = zod_1.z.object({
            imei: zod_1.z.string().min(1),
            checkBlacklist: zod_1.z.boolean().optional().default(false),
            excludePhoneId: zod_1.z.string().optional(),
        });
        const { imei, checkBlacklist, excludePhoneId } = schema.parse(req.body);
        const result = await (0, imei_service_1.validateIMEI)(imei, { checkBlacklist, excludePhoneId });
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
// GET /api/imei/quick/:imei   — validation rapide locale uniquement (format + Luhn)
router.get('/quick/:imei', (_req, res, next) => {
    try {
        const { imei } = _req.params;
        res.json((0, imei_service_1.quickValidateIMEI)(imei));
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=imei.routes.js.map