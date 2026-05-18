import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, authorize } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { logActivity } from '../services/activity.service.js'
import { AppError } from '../middleware/error.middleware.js'

const router = Router()
router.use(authenticate)

const phoneBaseSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  capacity: z.string().default(''),
  color: z.string().default(''),
  sellingPrice: z.number().positive('Prix de vente invalide'),
  purchasePrice: z.number().nonnegative().optional().nullable(),
  imei: z.string().regex(/^\d{15}$/, 'IMEI doit contenir 15 chiffres').optional().nullable(),
  serialNumber: z.string().min(8).max(20).optional().nullable(),
  notes: z.string().optional().default(''),
  photos: z.array(z.string()).optional().default([]),
})

const createPhoneSchema = phoneBaseSchema.refine(d => d.imei || d.serialNumber, {
  message: 'Un IMEI ou un numéro de série est requis',
})

const updatePhoneSchema = phoneBaseSchema.partial().omit({ imei: true })

router.get('/', async (req, res, next) => {
  try {
    const { brand, status, search, page = '1', limit = '50' } = req.query

    const where = {}
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
  } catch (err) {
    next(err)
  }
})

router.get('/available', async (_req, res, next) => {
  try {
    const phones = await prisma.phone.findMany({
      where: { status: 'disponible' },
      include: { addedBy: { select: { id: true, name: true } } },
      orderBy: { addedAt: 'desc' },
    })
    res.json(phones.map(p => ({ ...p, photos: JSON.parse(p.photos) })))
  } catch (err) {
    next(err)
  }
})

router.get('/stats', async (_req, res, next) => {
  try {
    const byBrand = await prisma.phone.groupBy({
      by: ['brand'],
      where: { status: 'disponible' },
      _count: { _all: true },
      orderBy: { _count: { brand: 'desc' } },
    })
    res.json(byBrand.map(b => ({ brand: b.brand, count: b._count._all })))
  } catch (err) {
    next(err)
  }
})

/** Historique des téléphones supprimés (instantané + auteur) — admin / gestionnaire stock */
router.get('/deletion-log', authorize('admin', 'gestionnaire'), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200)
    const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''

    const where = search
      ? {
          OR: [
            { imei: { contains: search } },
            { brand: { contains: search } },
            { model: { contains: search } },
            { formerPhoneId: { contains: search } },
          ],
        }
      : {}

    const [data, total] = await Promise.all([
      prisma.phoneDeletionLog.findMany({
        where,
        include: {
          deletedBy: { select: { id: true, name: true, email: true } },
          addedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { deletedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.phoneDeletionLog.count({ where }),
    ])

    res.json({
      data,
      total,
      limit,
      offset,
      page: Math.floor(offset / limit) + 1,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const phone = await prisma.phone.findUnique({
      where: { id: req.params.id },
      include: {
        addedBy: { select: { id: true, name: true } },
        movements: {
          include: { performedBy: { select: { id: true, name: true } } },
          orderBy: { date: 'desc' },
        },
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
  } catch (err) {
    next(err)
  }
})

router.post('/', validate(createPhoneSchema), async (req, res, next) => {
  try {
    const { photos, purchasePrice, serialNumber, imei, ...rest } = req.body

    if (imei) {
      const existing = await prisma.phone.findUnique({ where: { imei } })
      if (existing) throw new AppError(409, `L'IMEI ${imei} est déjà enregistré (téléphone #${existing.id})`)
    }

    const identifier = imei ?? null
    const notesWithSerial = serialNumber
      ? `${rest.notes ? rest.notes + '\n' : ''}Numéro de série : ${serialNumber}`
      : rest.notes ?? ''

    const phone = await prisma.phone.create({
      data: {
        ...rest,
        imei: identifier,
        notes: notesWithSerial,
        purchasePrice: purchasePrice ?? undefined,
        photos: JSON.stringify(photos),
        addedById: req.user.userId,
      },
      include: { addedBy: { select: { id: true, name: true } } },
    })

    await prisma.stockMovement.create({
      data: { type: 'entree', phoneId: phone.id, performedById: req.user.userId },
    })

    const identLabel = imei ? `IMEI: ${imei}` : `S/N: ${serialNumber}`
    await logActivity(
      req.user.userId,
      'PHONE_ADDED',
      `${phone.brand} ${phone.model} ajouté au stock (${identLabel}, prix: ${phone.sellingPrice.toLocaleString('fr-FR')} FC)`,
    )

    res.status(201).json({ ...phone, photos: JSON.parse(phone.photos) })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', validate(updatePhoneSchema), async (req, res, next) => {
  try {
    const data = req.body
    const updateData = { ...data }
    if (data.photos) updateData.photos = JSON.stringify(data.photos)

    const phone = await prisma.phone.update({
      where: { id: req.params.id },
      data: updateData,
      include: { addedBy: { select: { id: true, name: true } } },
    })

    await logActivity(req.user.userId, 'PHONE_UPDATED', `${phone.brand} ${phone.model} modifié`)
    res.json({ ...phone, photos: JSON.parse(phone.photos) })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', authorize('admin', 'gestionnaire'), async (req, res, next) => {
  try {
    const phone = await prisma.phone.findUnique({ where: { id: req.params.id } })
    if (!phone) throw new AppError(404, 'Téléphone introuvable')

    /** Stock libre ou sortie (essai) — pas de vente ; les sorties liées sont supprimées dans la transaction */
    const removableWithoutSale = ['disponible', 'sortie']
    if (!removableWithoutSale.includes(phone.status)) {
      throw new AppError(
        400,
        `Impossible de supprimer : statut « ${phone.status} » (seuls disponible et sortie sont autorisés sans vente).`,
      )
    }

    const hasSales = await prisma.sale.count({ where: { phoneId: phone.id } })
    if (hasSales > 0) {
      throw new AppError(400, 'Impossible de supprimer un téléphone lié à des ventes')
    }

    await prisma.$transaction(async tx => {
      await tx.phoneDeletionLog.create({
        data: {
          deletedById: req.user.userId,
          formerPhoneId: phone.id,
          brand: phone.brand,
          model: phone.model,
          capacity: phone.capacity,
          color: phone.color,
          imei: phone.imei,
          sellingPrice: phone.sellingPrice,
          purchasePrice: phone.purchasePrice,
          status: phone.status,
          photos: phone.photos,
          notes: phone.notes,
          addedAt: phone.addedAt,
          addedById: phone.addedById,
        },
      })
      await tx.phoneExit.deleteMany({ where: { phoneId: phone.id } })
      await tx.stockMovement.deleteMany({ where: { phoneId: phone.id } })
      await tx.phone.delete({ where: { id: phone.id } })
    })

    await logActivity(
      req.user.userId,
      'PHONE_DELETED',
      `${phone.brand} ${phone.model} supprimé (IMEI: ${phone.imei})`,
    )
    res.json({ message: 'Téléphone supprimé avec succès' })
  } catch (err) {
    next(err)
  }
})

export default router
