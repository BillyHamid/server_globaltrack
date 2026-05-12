import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, authorize } from '../middleware/auth.middleware'
import { validate } from '../middleware/validate.middleware'
import { logActivity } from '../services/activity.service'
import { AppError } from '../middleware/error.middleware'

const router = Router()
router.use(authenticate)

const createPhoneSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  capacity: z.string().default(''),
  color: z.string().default(''),
  sellingPrice: z.number().positive('Prix de vente invalide'),
  purchasePrice: z.number().nonnegative().optional().nullable(),
  imei: z.string().regex(/^\d{15}$/, 'IMEI doit contenir 15 chiffres'),
  notes: z.string().optional().default(''),
  photos: z.array(z.string()).optional().default([]),
})

const updatePhoneSchema = createPhoneSchema.partial().omit({ imei: true })

// GET /api/phones
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { brand, status, search, page = '1', limit = '50' } = req.query as Record<string, string>

    const where: Record<string, unknown> = {}
    if (brand) where.brand = brand
    if (status) where.status = status
    if (search) {
      where.OR = [
        { model: { contains: search } },
        { imei: { contains: search } },
        { brand: { contains: search } },
      ]
    }

    const [phones, total] = await Promise.all([
      prisma.phone.findMany({
        where,
        include: { addedBy: { select: { id: true, name: true } } },
        orderBy: { addedAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.phone.count({ where }),
    ])

    res.json({
      data: phones.map(p => ({ ...p, photos: JSON.parse(p.photos) })),
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    })
  } catch (err) { next(err) }
})

// GET /api/phones/available
router.get('/available', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const phones = await prisma.phone.findMany({
      where: { status: 'disponible' },
      include: { addedBy: { select: { id: true, name: true } } },
      orderBy: { addedAt: 'desc' },
    })
    res.json(phones.map(p => ({ ...p, photos: JSON.parse(p.photos) })))
  } catch (err) { next(err) }
})

// GET /api/phones/stats
router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const byBrand = await prisma.phone.groupBy({
      by: ['brand'],
      where: { status: 'disponible' },
      _count: { _all: true },
      orderBy: { _count: { brand: 'desc' } },
    })
    res.json(byBrand.map(b => ({ brand: b.brand, count: b._count._all })))
  } catch (err) { next(err) }
})

// GET /api/phones/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phone = await prisma.phone.findUnique({
      where: { id: req.params.id },
      include: {
        addedBy: { select: { id: true, name: true } },
        movements: { include: { performedBy: { select: { id: true, name: true } } }, orderBy: { date: 'desc' } },
        sales: {
          include: {
            client: { select: { id: true, name: true, phone: true } },
            payments: true,
          },
        },
      },
    })
    if (!phone) throw new AppError(404, 'Téléphone introuvable')
    res.json({ ...phone, photos: JSON.parse(phone.photos) })
  } catch (err) { next(err) }
})

// POST /api/phones
router.post('/', validate(createPhoneSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body as z.infer<typeof createPhoneSchema>

    // Vérifier unicité IMEI
    const existing = await prisma.phone.findUnique({ where: { imei: data.imei } })
    if (existing) throw new AppError(409, `L'IMEI ${data.imei} est déjà enregistré (téléphone #${existing.id})`)

    const { photos, purchasePrice, ...rest } = data
    const phone = await prisma.phone.create({
      data: {
        ...rest,
        purchasePrice: purchasePrice ?? undefined,
        photos: JSON.stringify(photos),
        addedById: req.user!.userId,
      },
      include: { addedBy: { select: { id: true, name: true } } },
    })

    // Créer le mouvement d'entrée
    await prisma.stockMovement.create({
      data: { type: 'entree', phoneId: phone.id, performedById: req.user!.userId },
    })

    await logActivity(
      req.user!.userId,
      'PHONE_ADDED',
      `${phone.brand} ${phone.model} ajouté au stock (IMEI: ${phone.imei}, prix: ${phone.sellingPrice.toLocaleString('fr-FR')} FC)`,
    )

    res.status(201).json({ ...phone, photos: JSON.parse(phone.photos) })
  } catch (err) { next(err) }
})

// PATCH /api/phones/:id
router.patch('/:id', validate(updatePhoneSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body as z.infer<typeof updatePhoneSchema>
    const updateData: Record<string, unknown> = { ...data }
    if (data.photos) updateData.photos = JSON.stringify(data.photos)

    const phone = await prisma.phone.update({
      where: { id: req.params.id },
      data: updateData,
      include: { addedBy: { select: { id: true, name: true } } },
    })

    await logActivity(req.user!.userId, 'PHONE_UPDATED', `${phone.brand} ${phone.model} modifié`)
    res.json({ ...phone, photos: JSON.parse(phone.photos) })
  } catch (err) { next(err) }
})

// DELETE /api/phones/:id  (admin/gestionnaire uniquement, uniquement si disponible + pas de vente)
router.delete('/:id', authorize('admin', 'gestionnaire'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phone = await prisma.phone.findUnique({ where: { id: req.params.id } })
    if (!phone) throw new AppError(404, 'Téléphone introuvable')
    if (phone.status !== 'disponible') {
      throw new AppError(400, 'Impossible de supprimer un téléphone vendu ou en crédit')
    }

    const hasSales = await prisma.sale.count({ where: { phoneId: phone.id } })
    if (hasSales > 0) {
      throw new AppError(400, 'Impossible de supprimer un téléphone lié à des ventes')
    }

    await prisma.stockMovement.deleteMany({ where: { phoneId: phone.id } })
    await prisma.phone.delete({ where: { id: phone.id } })

    await logActivity(req.user!.userId, 'PHONE_DELETED', `${phone.brand} ${phone.model} supprimé (IMEI: ${phone.imei})`)
    res.json({ message: 'Téléphone supprimé avec succès' })
  } catch (err) { next(err) }
})

export default router
