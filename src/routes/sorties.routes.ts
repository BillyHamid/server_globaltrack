import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth.middleware'
import { validate } from '../middleware/validate.middleware'
import { logActivity } from '../services/activity.service'
import { AppError } from '../middleware/error.middleware'

const HOURS_48_MS = 48 * 60 * 60 * 1000
const MAX_RETURN_PROOF_CHARS = 1_000_000

const router = Router()
router.use(authenticate)

const createSortieSchema = z.object({
  /** Client enregistré en base — le nom affiché sur la sortie est celui du client. */
  clientId: z.string().min(1, 'Client requis'),
  phoneId: z.string().min(1),
  motif: z.string().min(1, 'Motif requis').max(2000),
})

// GET /api/sorties — liste (en cours en premier)
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await prisma.phoneExit.findMany({
      include: {
        phone: { include: { addedBy: { select: { id: true, name: true } } } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })
    res.json(list)
  } catch (err) { next(err) }
})

// POST /api/sorties — nouvelle sortie (48 h)
router.post('/', validate(createSortieSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clientId, phoneId, motif } = req.body as z.infer<typeof createSortieSchema>

    const client = await prisma.client.findUnique({ where: { id: clientId } })
    if (!client) throw new AppError(404, 'Client introuvable')
    const personName = client.name

    const phone = await prisma.phone.findUnique({ where: { id: phoneId } })
    if (!phone) throw new AppError(404, 'Téléphone introuvable')
    if (phone.status !== 'disponible') {
      throw new AppError(400, 'Ce téléphone n’est pas disponible pour une sortie')
    }

    const openExit = await prisma.phoneExit.findFirst({
      where: { phoneId, status: 'en_cours' },
    })
    if (openExit) {
      throw new AppError(409, 'Une sortie est déjà en cours pour ce téléphone')
    }

    const now = new Date()
    const dueAt = new Date(now.getTime() + HOURS_48_MS)

    const exit = await prisma.$transaction(async (tx) => {
      const created = await tx.phoneExit.create({
        data: {
          personName,
          motif,
          phoneId,
          clientId,
          dueAt,
          createdById: req.user!.userId,
        },
        include: {
          phone: { include: { addedBy: { select: { id: true, name: true } } } },
          createdBy: { select: { id: true, name: true } },
        },
      })

      await tx.phone.update({
        where: { id: phoneId },
        data: { status: 'sortie' },
      })

      await tx.stockMovement.create({
        data: {
          type: 'sortie',
          phoneId,
          performedById: req.user!.userId,
          notes: `Sortie — ${personName} — ${motif.slice(0, 500)}`,
        },
      })

      return created
    })

    await logActivity(
      req.user!.userId,
      'SORTIE_CREATED',
      `Sortie : ${personName} — ${phone.brand} ${phone.model} (IMEI ${phone.imei}) — échéance ${dueAt.toISOString()}`,
    )

    res.status(201).json(exit)
  } catch (err) { next(err) }
})

const returnSchema = z.object({
  notes: z.preprocess(
    (v) => (v == null || v === '' ? '' : String(v)),
    z.string().max(2000),
  ),
  returnProof: z.preprocess(
    (v) => (v == null || v === '' ? '' : String(v)),
    z.string().max(MAX_RETURN_PROOF_CHARS),
  ),
})

// POST /api/sorties/:id/return — retour en magasin
router.post('/:id/return', validate(returnSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params
    const { notes, returnProof } = req.body as z.infer<typeof returnSchema>

    const exit = await prisma.phoneExit.findUnique({
      where: { id },
      include: { phone: true },
    })
    if (!exit) throw new AppError(404, 'Sortie introuvable')
    if (exit.status !== 'en_cours') {
      throw new AppError(400, 'Cette sortie est déjà clôturée')
    }

    const returnedAt = new Date()

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.phoneExit.update({
        where: { id },
        data: {
          status: 'retournee',
          returnedAt,
          returnProof: returnProof?.trim() ?? '',
        },
        include: {
          phone: { include: { addedBy: { select: { id: true, name: true } } } },
          createdBy: { select: { id: true, name: true } },
        },
      })

      await tx.phone.update({
        where: { id: exit.phoneId },
        data: { status: 'disponible' },
      })

      await tx.stockMovement.create({
        data: {
          type: 'retour_sortie',
          phoneId: exit.phoneId,
          performedById: req.user!.userId,
          notes: notes.trim()
            ? `Retour sortie — ${notes.trim()}`
            : `Retour sortie — ${exit.personName}`,
        },
      })

      await tx.alert.updateMany({
        where: { type: 'sortie_echeance', relatedId: id, status: { not: 'resolue' } },
        data: { status: 'resolue' },
      })

      return u
    })

    await logActivity(
      req.user!.userId,
      'SORTIE_RETURNED',
      `Retour sortie : ${exit.personName} — ${exit.phone.brand} ${exit.phone.model}`,
    )

    res.json(updated)
  } catch (err) { next(err) }
})

export default router
