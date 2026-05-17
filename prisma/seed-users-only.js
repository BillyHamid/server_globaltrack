/**
 * Seed minimal — crée uniquement les 4 comptes utilisateurs.
 * À utiliser pour démarrer avec une base vide (sans données de démo).
 *
 * Usage : npm run db:reset:empty
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding users only...')

  const [pwDjibrill, pwMohamadi, pwBernadette, pwBassirou] = await Promise.all([
    bcrypt.hash('Burkina2027$', 10),
    bcrypt.hash('SANA0602#', 10),
    bcrypt.hash('bernadette7622#', 10),
    bcrypt.hash('Beni3560#', 10),
  ])

  await Promise.all([
    prisma.user.upsert({
      where: { id: 'u1' },
      update: {
        name: 'Sana DJibrill',
        email: 'sana.djibrill@globaltrack.cd',
        password: pwDjibrill,
        role: 'admin',
        phone: '+1 (303) 915-2603',
        isActive: true,
      },
      create: {
        id: 'u1', name: 'Sana DJibrill', email: 'sana.djibrill@globaltrack.cd',
        password: pwDjibrill, role: 'admin', phone: '+1 (303) 915-2603', isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { id: 'u2' },
      update: {
        name: 'Sana Mohamadi',
        email: 'sana.mohamadi@globaltrack.cd',
        password: pwMohamadi,
        role: 'vendeur',
        phone: '+226 73 63 72 88',
        isActive: true,
      },
      create: {
        id: 'u2', name: 'Sana Mohamadi', email: 'sana.mohamadi@globaltrack.cd',
        password: pwMohamadi, role: 'vendeur', phone: '+226 73 63 72 88', isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { id: 'u3' },
      update: {
        name: 'Bernadette',
        email: 'bernadette@globaltrack.cd',
        password: pwBernadette,
        role: 'vendeur',
        phone: '+226 76 22 56 53',
        isActive: true,
      },
      create: {
        id: 'u3', name: 'Bernadette', email: 'bernadette@globaltrack.cd',
        password: pwBernadette, role: 'vendeur', phone: '+226 76 22 56 53', isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { id: 'u4' },
      update: {
        name: 'Bassirou',
        email: 'bassirou@globaltrack.cd',
        password: pwBassirou,
        role: 'vendeur',
        phone: '+226 77 84 72 69',
        isActive: true,
      },
      create: {
        id: 'u4', name: 'Bassirou', email: 'bassirou@globaltrack.cd',
        password: pwBassirou, role: 'vendeur', phone: '+226 77 84 72 69', isActive: true,
      },
    }),
  ])

  console.log('✅ 4 users created\n')
  console.log('🎉 Empty database ready!')
  console.log('\nComptes de connexion (mots de passe individuels — voir équipe / seed) :')
  console.log('  sana.djibrill@globaltrack.cd   admin')
  console.log('  sana.mohamadi@globaltrack.cd   vendeur')
  console.log('  bernadette@globaltrack.cd      vendeur')
  console.log('  bassirou@globaltrack.cd        vendeur')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
