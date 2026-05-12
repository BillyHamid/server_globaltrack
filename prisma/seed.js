import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // ─── Users (mots de passe distincts, hachés — ne pas les afficher en clair) ─
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
        phone: '+243 991 234 567',
        isActive: true,
      },
      create: {
        id: 'u1', name: 'Sana DJibrill', email: 'sana.djibrill@globaltrack.cd',
        password: pwDjibrill, role: 'admin', phone: '+243 991 234 567', isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { id: 'u2' },
      update: {
        name: 'Sana Mohamadi',
        email: 'sana.mohamadi@globaltrack.cd',
        password: pwMohamadi,
        role: 'vendeur',
        phone: '+243 992 345 678',
        isActive: true,
      },
      create: {
        id: 'u2', name: 'Sana Mohamadi', email: 'sana.mohamadi@globaltrack.cd',
        password: pwMohamadi, role: 'vendeur', phone: '+243 992 345 678', isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { id: 'u3' },
      update: {
        name: 'Bernadette',
        email: 'bernadette@globaltrack.cd',
        password: pwBernadette,
        role: 'vendeur',
        phone: '+243 993 456 789',
        isActive: true,
      },
      create: {
        id: 'u3', name: 'Bernadette', email: 'bernadette@globaltrack.cd',
        password: pwBernadette, role: 'vendeur', phone: '+243 993 456 789', isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { id: 'u4' },
      update: {
        name: 'Bassirou',
        email: 'bassirou@globaltrack.cd',
        password: pwBassirou,
        role: 'vendeur',
        phone: '+243 994 567 890',
        isActive: true,
      },
      create: {
        id: 'u4', name: 'Bassirou', email: 'bassirou@globaltrack.cd',
        password: pwBassirou, role: 'vendeur', phone: '+243 994 567 890', isActive: true,
      },
    }),
  ])

  console.log(`✅ ${4} users created`)

  // ─── Clients ─────────────────────────────────────────────────────────────
  const clients = [
    { id: 'c1', name: 'Alain Mutombo', phone: '+243 810 111 222', email: 'alain@gmail.com', address: 'Av. Lumumba, Lubumbashi', totalPurchases: 3 },
    { id: 'c2', name: 'Grace Mwamba', phone: '+243 820 222 333', email: 'grace@gmail.com', address: 'Av. Kasavubu, Kinshasa', totalPurchases: 2 },
    { id: 'c3', name: 'David Kasongo', phone: '+243 830 333 444', totalPurchases: 1 },
    { id: 'c4', name: 'Esther Ngalula', phone: '+243 840 444 555', email: 'esther@yahoo.fr', address: 'Av. Sendwe, Lubumbashi', totalPurchases: 4 },
    { id: 'c5', name: 'François Ilunga', phone: '+243 850 555 666', totalPurchases: 1 },
    { id: 'c6', name: 'Henriette Kabila', phone: '+243 860 666 777', email: 'henriette@gmail.com', totalPurchases: 2 },
    { id: 'c7', name: 'Joseph Kalala', phone: '+243 870 777 888', address: 'Av. Mobutu, Mbujimayi', totalPurchases: 1 },
    { id: 'c8', name: 'Nadine Tshilombo', phone: '+243 880 888 999', email: 'nadine@outlook.com', totalPurchases: 3 },
    { id: 'c9', name: 'Richard Katumba', phone: '+243 890 999 000', totalPurchases: 1 },
    { id: 'c10', name: 'Sylvie Kazadi', phone: '+243 811 123 456', email: 'sylvie@gmail.com', address: 'Av. Tshombe, Lubumbashi', totalPurchases: 2 },
    { id: 'c11', name: 'Michel Kapend', phone: '+243 821 234 567', totalPurchases: 1 },
    { id: 'c12', name: 'Annie Mbombo', phone: '+243 831 345 678', email: 'annie@gmail.com', totalPurchases: 2 },
    { id: 'c13', name: 'Didier Lupaka', phone: '+243 841 456 789', totalPurchases: 1 },
    { id: 'c14', name: 'Clarisse Muland', phone: '+243 851 567 890', email: 'clarisse@yahoo.fr', totalPurchases: 1 },
    { id: 'c15', name: 'Bob Tshibangu', phone: '+243 861 678 901', totalPurchases: 2 },
  ]
  for (const c of clients) {
    await prisma.client.upsert({ where: { id: c.id }, update: {}, create: c })
  }
  console.log(`✅ ${clients.length} clients created`)

  // ─── Phones ──────────────────────────────────────────────────────────────
  const phonesData = [
    { id: 'p1', brand: 'Samsung', model: 'Galaxy S24 Ultra', capacity: '256GB', color: 'Noir', sellingPrice: 700000, imei: '353456789012345', status: 'disponible', addedById: 'u1', addedAt: new Date('2026-01-10') },
    { id: 'p2', brand: 'iPhone', model: '15 Pro Max', capacity: '256GB', color: 'Titane Bleu', sellingPrice: 800000, imei: '353456789012346', status: 'vendu', addedById: 'u1', addedAt: new Date('2026-01-12') },
    { id: 'p3', brand: 'Samsung', model: 'Galaxy A54', capacity: '128GB', color: 'Blanc', sellingPrice: 230000, imei: '353456789012347', status: 'credit', addedById: 'u4', addedAt: new Date('2026-01-15') },
    { id: 'p4', brand: 'iPhone', model: '14', capacity: '128GB', color: 'Bleu', sellingPrice: 420000, imei: '353456789012348', status: 'disponible', addedById: 'u1', addedAt: new Date('2026-01-18') },
    { id: 'p5', brand: 'iPad', model: 'Pro 11 M4', capacity: '128GB', color: 'Gris sidéral', sellingPrice: 170000, imei: '353456789012349', status: 'vendu', addedById: 'u4', addedAt: new Date('2026-01-20') },
    { id: 'p6', brand: 'Samsung', model: 'Galaxy S23', capacity: '128GB', color: 'Noir', sellingPrice: 390000, imei: '353456789012350', status: 'disponible', addedById: 'u1', addedAt: new Date('2026-01-22') },
    { id: 'p7', brand: 'iPhone', model: '13', capacity: '128GB', color: 'Minuit', sellingPrice: 330000, imei: '353456789012351', status: 'credit', addedById: 'u4', addedAt: new Date('2026-01-25') },
    { id: 'p8', brand: 'Watch', model: 'Ultra 2', capacity: '64GB', color: 'Titane naturel', sellingPrice: 140000, imei: '353456789012352', status: 'vendu', addedById: 'u1', addedAt: new Date('2026-02-01') },
    { id: 'p9', brand: 'Samsung', model: 'Galaxy Z Flip 5', capacity: '256GB', color: 'Lavande', sellingPrice: 510000, imei: '353456789012353', status: 'disponible', addedById: 'u4', addedAt: new Date('2026-02-03') },
    { id: 'p10', brand: 'iPhone', model: '15', capacity: '128GB', color: 'Rose', sellingPrice: 500000, imei: '353456789012354', status: 'disponible', addedById: 'u1', addedAt: new Date('2026-02-05') },
    { id: 'p11', brand: 'iPad', model: 'Air 13 M2', capacity: '256GB', color: 'Bleu', sellingPrice: 290000, imei: '353456789012355', status: 'vendu', addedById: 'u4', addedAt: new Date('2026-02-08') },
    { id: 'p12', brand: 'Samsung', model: 'Galaxy A34', capacity: '128GB', color: 'Argent', sellingPrice: 190000, imei: '353456789012356', status: 'disponible', addedById: 'u1', addedAt: new Date('2026-02-10') },
    { id: 'p13', brand: 'iPhone', model: 'SE 2022', capacity: '64GB', color: 'Rouge', sellingPrice: 250000, imei: '353456789012357', status: 'credit', addedById: 'u1', addedAt: new Date('2026-02-12') },
    { id: 'p14', brand: 'Watch', model: 'Series 9', capacity: '32GB', color: 'Minuit', sellingPrice: 115000, imei: '353456789012358', status: 'vendu', addedById: 'u4', addedAt: new Date('2026-02-15') },
    { id: 'p15', brand: 'Samsung', model: 'Galaxy S24', capacity: '128GB', color: 'Jaune', sellingPrice: 470000, imei: '353456789012359', status: 'disponible', addedById: 'u1', addedAt: new Date('2026-02-18') },
    { id: 'p16', brand: 'iPhone', model: '15 Pro', capacity: '128GB', color: 'Titane Noir', sellingPrice: 630000, imei: '353456789012360', status: 'disponible', addedById: 'u1', addedAt: new Date('2026-02-20') },
    { id: 'p17', brand: 'MacBook', model: 'Air 15 M3', capacity: '256GB', color: 'Gris sidéral', sellingPrice: 190000, imei: '353456789012361', status: 'vendu', addedById: 'u4', addedAt: new Date('2026-02-22') },
    { id: 'p18', brand: 'Samsung', model: 'Galaxy A14', capacity: '64GB', color: 'Noir', sellingPrice: 95000, imei: '353456789012362', status: 'disponible', addedById: 'u1', addedAt: new Date('2026-02-25') },
    { id: 'p19', brand: 'iPhone', model: '14 Plus', capacity: '128GB', color: 'Jaune', sellingPrice: 470000, imei: '353456789012363', status: 'credit', addedById: 'u4', addedAt: new Date('2026-02-28') },
    { id: 'p20', brand: 'Samsung', model: 'Galaxy Z Fold 5', capacity: '256GB', color: 'Noir', sellingPrice: 430000, imei: '353456789012364', status: 'disponible', addedById: 'u1', addedAt: new Date('2026-03-01') },
    { id: 'p21', brand: 'Samsung', model: 'Galaxy M54', capacity: '128GB', color: 'Bleu', sellingPrice: 205000, imei: '353456789012365', status: 'disponible', addedById: 'u4', addedAt: new Date('2026-03-03') },
    { id: 'p22', brand: 'iPhone', model: '16 Pro', capacity: '256GB', color: 'Desert', sellingPrice: 720000, imei: '353456789012366', status: 'disponible', addedById: 'u1', addedAt: new Date('2026-03-05') },
    { id: 'p23', brand: 'MacBook', model: 'Pro 14 M3', capacity: '512GB', color: 'Argent', sellingPrice: 350000, imei: '353456789012367', status: 'vendu', addedById: 'u1', addedAt: new Date('2026-03-07') },
    { id: 'p24', brand: 'Samsung', model: 'Galaxy Z Fold 5', capacity: '512GB', color: 'Creme', sellingPrice: 780000, imei: '353456789012368', status: 'disponible', addedById: 'u4', addedAt: new Date('2026-03-10') },
    { id: 'p25', brand: 'iPhone', model: '16', capacity: '128GB', color: 'Blanc', sellingPrice: 540000, imei: '353456789012369', status: 'disponible', addedById: 'u1', addedAt: new Date('2026-03-12') },
    { id: 'p26', brand: 'Watch', model: 'SE 2', capacity: '32GB', color: 'Minuit', sellingPrice: 195000, imei: '353456789012370', status: 'disponible', addedById: 'u4', addedAt: new Date('2026-03-14') },
    { id: 'p27', brand: 'Samsung', model: 'Galaxy A15', capacity: '128GB', color: 'Bleu', sellingPrice: 110000, imei: '353456789012371', status: 'vendu', addedById: 'u1', addedAt: new Date('2026-03-16') },
    { id: 'p28', brand: 'MacBook', model: 'Air 13 M2', capacity: '256GB', color: 'Or', sellingPrice: 80000, imei: '353456789012372', status: 'disponible', addedById: 'u1', addedAt: new Date('2026-03-18') },
    { id: 'p29', brand: 'iPhone', model: '14 Pro', capacity: '256GB', color: 'Violet', sellingPrice: 550000, imei: '353456789012373', status: 'credit', addedById: 'u4', addedAt: new Date('2026-03-20') },
    { id: 'p30', brand: 'Samsung', model: 'Galaxy S24+', capacity: '256GB', color: 'Violet', sellingPrice: 560000, imei: '353456789012374', status: 'disponible', addedById: 'u1', addedAt: new Date('2026-03-22') },
  ]
  for (const p of phonesData) {
    await prisma.phone.upsert({ where: { id: p.id }, update: {}, create: p })
  }
  console.log(`✅ ${phonesData.length} phones created`)

  // ─── Sales & Payments ────────────────────────────────────────────────────
  const salesData = [
    { id: 's1', phoneId: 'p2', clientId: 'c1', sellerId: 'u2', type: 'cash', listPriceAtSale: 800000, totalAmount: 800000, paidAmount: 800000, remainingAmount: 0, paymentStatus: 'paye', date: new Date('2026-01-20') },
    { id: 's2', phoneId: 'p3', clientId: 'c2', sellerId: 'u3', type: 'credit', listPriceAtSale: 260000, totalAmount: 230000, paidAmount: 110000, remainingAmount: 120000, paymentStatus: 'partiel', date: new Date('2026-01-25'), dueDate: new Date('2026-04-25') },
    { id: 's3', phoneId: 'p5', clientId: 'c4', sellerId: 'u2', type: 'cash', listPriceAtSale: 170000, totalAmount: 170000, paidAmount: 170000, remainingAmount: 0, paymentStatus: 'paye', date: new Date('2026-01-28') },
    { id: 's4', phoneId: 'p7', clientId: 'c3', sellerId: 'u3', type: 'credit', listPriceAtSale: 360000, totalAmount: 330000, paidAmount: 120000, remainingAmount: 210000, paymentStatus: 'partiel', date: new Date('2026-02-01'), dueDate: new Date('2026-04-01') },
    { id: 's5', phoneId: 'p8', clientId: 'c6', sellerId: 'u2', type: 'cash', listPriceAtSale: 140000, totalAmount: 140000, paidAmount: 140000, remainingAmount: 0, paymentStatus: 'paye', date: new Date('2026-02-05') },
    { id: 's6', phoneId: 'p11', clientId: 'c4', sellerId: 'u3', type: 'cash', listPriceAtSale: 290000, totalAmount: 290000, paidAmount: 290000, remainingAmount: 0, paymentStatus: 'paye', date: new Date('2026-02-12') },
    { id: 's7', phoneId: 'p13', clientId: 'c5', sellerId: 'u2', type: 'credit', listPriceAtSale: 250000, totalAmount: 250000, paidAmount: 0, remainingAmount: 250000, paymentStatus: 'impaye', date: new Date('2026-02-15'), dueDate: new Date('2026-03-15') },
    { id: 's8', phoneId: 'p14', clientId: 'c8', sellerId: 'u3', type: 'cash', listPriceAtSale: 115000, totalAmount: 115000, paidAmount: 115000, remainingAmount: 0, paymentStatus: 'paye', date: new Date('2026-02-20') },
    { id: 's9', phoneId: 'p17', clientId: 'c10', sellerId: 'u2', type: 'cash', listPriceAtSale: 190000, totalAmount: 190000, paidAmount: 190000, remainingAmount: 0, paymentStatus: 'paye', date: new Date('2026-02-25') },
    { id: 's10', phoneId: 'p19', clientId: 'c12', sellerId: 'u3', type: 'credit', listPriceAtSale: 470000, totalAmount: 470000, paidAmount: 380000, remainingAmount: 90000, paymentStatus: 'partiel', date: new Date('2026-03-01'), dueDate: new Date('2026-05-01') },
    { id: 's11', phoneId: 'p23', clientId: 'c13', sellerId: 'u2', type: 'cash', listPriceAtSale: 350000, totalAmount: 350000, paidAmount: 350000, remainingAmount: 0, paymentStatus: 'paye', date: new Date('2026-03-08') },
    { id: 's12', phoneId: 'p27', clientId: 'c15', sellerId: 'u3', type: 'cash', listPriceAtSale: 110000, totalAmount: 110000, paidAmount: 110000, remainingAmount: 0, paymentStatus: 'paye', date: new Date('2026-03-18') },
    { id: 's13', phoneId: 'p29', clientId: 'c14', sellerId: 'u2', type: 'credit', listPriceAtSale: 550000, totalAmount: 550000, paidAmount: 0, remainingAmount: 550000, paymentStatus: 'impaye', date: new Date('2026-03-22'), dueDate: new Date('2026-04-22') },
    { id: 's14', phoneId: 'p9', clientId: 'c7', sellerId: 'u3', type: 'credit', listPriceAtSale: 540000, totalAmount: 510000, paidAmount: 280000, remainingAmount: 230000, paymentStatus: 'partiel', date: new Date('2026-03-25'), dueDate: new Date('2026-05-25') },
    { id: 's15', phoneId: 'p10', clientId: 'c9', sellerId: 'u2', type: 'credit', listPriceAtSale: 520000, totalAmount: 500000, paidAmount: 130000, remainingAmount: 370000, paymentStatus: 'partiel', date: new Date('2026-03-28'), dueDate: new Date('2026-04-28') },
  ]
  for (const s of salesData) {
    const { id, ...rest } = s
    await prisma.sale.upsert({ where: { id }, update: rest, create: s })
  }
  console.log(`✅ ${salesData.length} sales created`)

  // ─── Payments ─────────────────────────────────────────────────────────────
  const paymentsData = [
    { id: 'pay-s1-1', saleId: 's1', amount: 800000, date: new Date('2026-01-20'), receivedById: 'u2', method: 'cash' },
    { id: 'pay-s2-1', saleId: 's2', amount: 60000, date: new Date('2026-01-25'), receivedById: 'u2', method: 'cash' },
    { id: 'pay-s2-2', saleId: 's2', amount: 50000, date: new Date('2026-02-10'), receivedById: 'u3', method: 'mobile_money' },
    { id: 'pay-s3-1', saleId: 's3', amount: 170000, date: new Date('2026-01-28'), receivedById: 'u2', method: 'cash' },
    { id: 'pay-s4-1', saleId: 's4', amount: 120000, date: new Date('2026-02-01'), receivedById: 'u2', method: 'cash' },
    { id: 'pay-s5-1', saleId: 's5', amount: 140000, date: new Date('2026-02-05'), receivedById: 'u3', method: 'cash' },
    { id: 'pay-s6-1', saleId: 's6', amount: 290000, date: new Date('2026-02-12'), receivedById: 'u2', method: 'cash' },
    { id: 'pay-s8-1', saleId: 's8', amount: 115000, date: new Date('2026-02-20'), receivedById: 'u3', method: 'cash' },
    { id: 'pay-s9-1', saleId: 's9', amount: 190000, date: new Date('2026-02-25'), receivedById: 'u2', method: 'cash' },
    { id: 'pay-s10-1', saleId: 's10', amount: 200000, date: new Date('2026-03-01'), receivedById: 'u3', method: 'cash' },
    { id: 'pay-s10-2', saleId: 's10', amount: 180000, date: new Date('2026-03-15'), receivedById: 'u2', method: 'mobile_money' },
    { id: 'pay-s11-1', saleId: 's11', amount: 350000, date: new Date('2026-03-08'), receivedById: 'u3', method: 'cash' },
    { id: 'pay-s12-1', saleId: 's12', amount: 110000, date: new Date('2026-03-18'), receivedById: 'u2', method: 'cash' },
    { id: 'pay-s14-1', saleId: 's14', amount: 280000, date: new Date('2026-03-25'), receivedById: 'u3', method: 'cash' },
    { id: 'pay-s15-1', saleId: 's15', amount: 130000, date: new Date('2026-03-28'), receivedById: 'u2', method: 'cash' },
  ]
  for (const p of paymentsData) {
    await prisma.payment.upsert({ where: { id: p.id }, update: {}, create: p })
  }
  console.log(`✅ ${paymentsData.length} payments created`)

  // ─── Stock Movements ──────────────────────────────────────────────────────
  const movementsData = phonesData.map(p => ({
    id: `mv-${p.id}-entree`,
    type: 'entree',
    phoneId: p.id,
    performedById: p.addedById,
    date: p.addedAt,
  }))
  const venteMov = salesData.map(s => ({
    id: `mv-${s.phoneId}-vente`,
    type: 'vente',
    phoneId: s.phoneId,
    performedById: s.sellerId,
    date: s.date,
  }))
  for (const m of [...movementsData, ...venteMov]) {
    await prisma.stockMovement.upsert({ where: { id: m.id }, update: {}, create: m })
  }
  console.log(`✅ ${movementsData.length + venteMov.length} stock movements created`)

  // ─── Alerts ───────────────────────────────────────────────────────────────
  const alertsData = [
    { id: 'al1', type: 'credit_retard', title: 'Crédit en retard — François Ilunga', description: 'La vente s7 (iPhone SE 2022) est en retard de paiement depuis le 2026-03-15', status: 'nouvelle', relatedId: 's7' },
    { id: 'al2', type: 'credit_retard', title: 'Crédit en retard — Clarisse Muland', description: 'La vente s13 (iPhone 14 Pro) est en retard de paiement depuis le 2026-04-22', status: 'nouvelle', relatedId: 's13' },
    { id: 'al3', type: 'stock_ancien', title: 'Stock ancien — Galaxy S24 Ultra', description: 'Le téléphone p1 (Samsung Galaxy S24 Ultra) est en stock depuis plus de 60 jours', status: 'nouvelle', relatedId: 'p1' },
  ]
  for (const a of alertsData) {
    await prisma.alert.upsert({ where: { id: a.id }, update: {}, create: a })
  }
  console.log(`✅ ${alertsData.length} alerts created`)

  // ─── Activity Logs ────────────────────────────────────────────────────────
  const logs = [
    { id: 'log1', userId: 'u1', action: 'PHONE_ADDED', details: 'Samsung Galaxy S24 Ultra ajouté au stock (IMEI: 353456789012345)', timestamp: new Date('2026-01-10') },
    { id: 'log2', userId: 'u2', action: 'SALE_CREATED', details: 'Vente cash iPhone 15 Pro Max à Alain Mutombo — 800 000 FC', timestamp: new Date('2026-01-20') },
    { id: 'log3', userId: 'u3', action: 'SALE_CREATED', details: 'Vente crédit Samsung Galaxy A54 à Grace Mwamba — 230 000 FC', timestamp: new Date('2026-01-25') },
    { id: 'log4', userId: 'u2', action: 'PAYMENT_ADDED', details: 'Paiement de 60 000 FC reçu pour la vente s2', timestamp: new Date('2026-01-25') },
    { id: 'log5', userId: 'u2', action: 'SALE_CREATED', details: 'Vente cash iPad Pro 11 M4 à Esther Ngalula — 170 000 FC', timestamp: new Date('2026-01-28') },
  ]
  for (const l of logs) {
    await prisma.activityLog.upsert({ where: { id: l.id }, update: {}, create: l })
  }
  console.log(`✅ ${logs.length} activity logs created`)

  console.log('\n🎉 Database seeded successfully!')
  console.log('\nComptes de connexion (mots de passe individuels — voir équipe / seed) :')
  console.log('  sana.djibrill@globaltrack.cd   admin       — Sana DJibrill')
  console.log('  sana.mohamadi@globaltrack.cd   vendeur     — Sana Mohamadi')
  console.log('  bernadette@globaltrack.cd      vendeur     — Bernadette')
  console.log('  bassirou@globaltrack.cd        vendeur     — Bassirou')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
