import { prisma } from '../lib/prisma'

export type ActivityAction =
  | 'PHONE_ADDED'
  | 'PHONE_UPDATED'
  | 'PHONE_DELETED'
  | 'SALE_CREATED'
  | 'SALE_UPDATED'
  | 'PAYMENT_ADDED'
  | 'PAYMENT_PROOF_UPDATED'
  | 'CLIENT_ADDED'
  | 'CLIENT_UPDATED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'ALERT_RESOLVED'
  | 'SORTIE_CREATED'
  | 'SORTIE_RETURNED'
  | 'LOGIN'

export async function logActivity(
  userId: string,
  action: ActivityAction,
  details: string,
): Promise<void> {
  try {
    await prisma.activityLog.create({ data: { userId, action, details } })
  } catch {
    // Ne jamais faire échouer la requête principale à cause d'un log
  }
}
