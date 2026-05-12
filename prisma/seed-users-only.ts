/**
 * Seed minimal — crée uniquement les 4 comptes utilisateurs.
 * À utiliser pour démarrer avec une base vide (sans données de démo).
 *
 * Usage : npm run db:reset:empty
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

/** Mot de passe dev partagé par les 4 comptes seed (à changer en prod). */
const DEV_PASSWORD = 'globaltrack2024'

async function main() {
  console.log('🌱 Seeding users only...')

  const password = await bcrypt.hash(DEV_PASSWORD, 10)

  await Promise.all([
    prisma.user.upsert({
      where: { id: 'u1' },
      update: {
        name: 'SA DJibrill',
        email: 'sana.djibrill@globaltrack.cd',
        password,
        role: 'admin',
        phone: '+243 991 234 567',
        isActive: true,
      },
      create: {
        id: 'u1', name: 'Sana DJibrill', email: 'sana.djibrill@globaltrack.cd',
        password, role: 'admin', phone: '+243 991 234 567', isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { id: 'u2' },
      update: {
        name: 'Sana Mohamadi',
        email: 'sana.mohamadi@globaltrack.cd',
        password,
        role: 'vendeur',
        phone: '+243 992 345 678',
        isActive: true,
      },
      create: {
        id: 'u2', name: 'Sana Mohamadi', email: 'sana.mohamadi@globaltrack.cd',
        password, role: 'vendeur', phone: '+243 992 345 678', isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { id: 'u3' },
      update: {
        name: 'Bernadette',
        email: 'bernadette@globaltrack.cd',
        password,
        role: 'vendeur',
        phone: '+243 993 456 789',
        isActive: true,
      },
      create: {
        id: 'u3', name: 'Bernadette', email: 'bernadette@globaltrack.cd',
        password, role: 'vendeur', phone: '+243 993 456 789', isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { id: 'u4' },
      update: {
        name: 'Bassirou',
        email: 'bassirou@globaltrack.cd',
        password,
        role: 'vendeur',
        phone: '+243 994 567 890',
        isActive: true,
      },
      create: {
        id: 'u4', name: 'Bassirou', email: 'bassirou@globaltrack.cd',
        password, role: 'vendeur', phone: '+243 994 567 890', isActive: true,
      },
    }),
  ])

  console.log('✅ 4 users created\n')
  console.log('🎉 Empty database ready!')
  console.log('\nComptes de connexion :')
  console.log('  sana.djibrill@globaltrack.cd  | globaltrack2024 (admin)')
  console.log('  sana.mohamadi@globaltrack.cd  | globaltrack2024 (vendeur)')
  console.log('  bernadette@globaltrack.cd     | globaltrack2024 (vendeur)')
  console.log(`  bassirou@globaltrack.cd       | ${DEV_PASSWORD} (vendeur)`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
