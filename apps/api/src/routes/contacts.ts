import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import { requireAuth } from '../middleware/authMiddleware';
import { sendSuccess, sendCreated, sendPaginated, sendError } from '../utils/response';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

const router: Router = Router();
const prisma = new PrismaClient();

// GET /contacts?tenantId=&search=&tag=&page=&pageSize=
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  if (!tenantId) {
    sendError(res, 'tenantId is required', 400);
    return;
  }

  const search = req.query.search as string | undefined;
  const tag = req.query.tag as string | undefined;
  const page = parseInt(req.query.page as string ?? '1', 10);
  const pageSize = parseInt(req.query.pageSize as string ?? '20', 10);

  const where: Prisma.ContactWhereInput = {
    tenantId,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as Prisma.QueryMode } },
        { phone: { contains: search } },
      ],
    }),
    ...(tag && { tags: { has: tag } }),
  };

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
  ]);

  sendPaginated(res, contacts, total, page, pageSize);
});

// GET /contacts/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const contact = await prisma.contact.findUnique({
    where: { id: req.params.id },
  });

  if (!contact) {
    throw new NotFoundError('Contact');
  }

  // Get conversation and order counts
  const [conversationCount, orderCount] = await Promise.all([
    prisma.conversation.count({
      where: { tenantId: contact.tenantId, callerPhone: contact.phone },
    }),
    prisma.order.count({
      where: { tenantId: contact.tenantId, callerPhone: contact.phone },
    }),
  ]);

  sendSuccess(res, {
    ...contact,
    conversationCount,
    orderCount,
  });
});

// POST /contacts
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const CreateSchema = z.object({
    tenantId: z.string().min(1),
    phone: z.string().min(1),
    name: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
  });

  const body = CreateSchema.parse(req.body);

  const contact = await prisma.contact.create({
    data: {
      tenantId: body.tenantId,
      phone: body.phone,
      name: body.name ?? null,
      email: body.email || null,
      notes: body.notes ?? null,
      tags: body.tags ?? [],
    },
  });

  logger.info('Contact created', { contactId: contact.id, tenantId: body.tenantId });
  sendCreated(res, contact);
});

// PATCH /contacts/:id
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const UpdateSchema = z.object({
    name: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
  });

  const body = UpdateSchema.parse(req.body);

  const existing = await prisma.contact.findUnique({
    where: { id: req.params.id },
  });

  if (!existing) {
    throw new NotFoundError('Contact');
  }

  const contact = await prisma.contact.update({
    where: { id: req.params.id },
    data: {
      ...(body.name !== undefined && { name: body.name || null }),
      ...(body.email !== undefined && { email: body.email || null }),
      ...(body.notes !== undefined && { notes: body.notes || null }),
      ...(body.tags !== undefined && { tags: body.tags }),
    },
  });

  logger.info('Contact updated', { contactId: contact.id });
  sendSuccess(res, contact);
});

// DELETE /contacts/:id
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const existing = await prisma.contact.findUnique({
    where: { id: req.params.id },
  });

  if (!existing) {
    throw new NotFoundError('Contact');
  }

  await prisma.contact.delete({ where: { id: req.params.id } });

  logger.info('Contact deleted', { contactId: req.params.id });
  sendSuccess(res, { deleted: true });
});

export default router;
