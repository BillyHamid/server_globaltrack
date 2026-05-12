import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.PRISMA_LOG === '1'
        ? ['query', 'error', 'warn']
        : process.env.NODE_ENV === 'production'
          ? ['error']
          : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export async function disconnectPrisma() {
  await prisma.$disconnect()
}
