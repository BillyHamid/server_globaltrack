import { prisma } from '../lib/prisma.js'

/**
 * Ne jamais faire échouer la requête principale à cause d'un log
 * @param {string} userId
 * @param {string} action
 * @param {string} details
 */
export async function logActivity(userId, action, details) {
  try {
    await prisma.activityLog.create({ data: { userId, action, details } })
  } catch {
    // ignorer
  }
}
