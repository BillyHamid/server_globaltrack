"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logActivity = logActivity;
const prisma_1 = require("../lib/prisma");
async function logActivity(userId, action, details) {
    try {
        await prisma_1.prisma.activityLog.create({ data: { userId, action, details } });
    }
    catch {
        // Ne jamais faire échouer la requête principale à cause d'un log
    }
}
//# sourceMappingURL=activity.service.js.map