import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // 'query' uniquement si PRISMA_LOG=1 pour ne pas polluer les logs en dev normal
    log: process.env.PRISMA_LOG === '1'
      ? ['query', 'error', 'warn']
      : process.env.NODE_ENV === 'production'
        ? ['error']
        : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect()
}
