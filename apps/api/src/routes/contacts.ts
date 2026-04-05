import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient, Prisma, ContactStatus } from '@prisma/client';
import { requireAuth } from '../middleware/authMiddleware';
import { sendSuccess, sendCreated, sendPaginated, sendError } from '../utils/response';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

const router: Router = Router();
const prisma = new PrismaClient();

// GET /contacts?tenantId=&search=&tag=&status=&page=&pageSize=
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  if (!tenantId) {
    sendError(res, 'tenantId is required', 400);
    return;
  }

  const search = req.query.search as string | undefined;
  const tag = req.query.tag as string | undefined;
  const status = req.query.status as ContactStatus | undefined;
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
    ...(status && { status }),
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

// GET /contacts/export?tenantId= — CSV download (must be before /:id)
router.get('/export', requireAuth, async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  if (!tenantId) {
    sendError(res, 'tenantId is required', 400);
    return;
  }

  const contacts = await prisma.contact.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
  });

  const escape = (val: string | null | undefined) => {
    if (val == null) return '';
    return `"${String(val).replace(/"/g, '""')}"`;
  };

  const header = 'id,phone,name,email,status,tags,totalOrders,totalSpent,lastContactAt,createdAt';
  const rows = contacts.map((c) =>
    [
      escape(c.id),
      escape(c.phone),
      escape(c.name),
      escape(c.email),
      escape(c.status),
      escape(c.tags.join(';')),
      c.totalOrders,
      c.totalSpent,
      escape(c.lastContactAt?.toISOString()),
      escape(c.createdAt.toISOString()),
    ].join(',')
  );

  const csv = [header, ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
  res.send(csv);
});

// GET /contacts/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const contact = await prisma.contact.findUnique({
    where: { id: req.params.id },
  });

  if (!contact) {
    throw new NotFoundError('Contact');
  }

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

// GET /contacts/:id/activity — unified timeline
router.get('/:id/activity', requireAuth, async (req: Request, res: Response) => {
  const contact = await prisma.contact.findUnique({
    where: { id: req.params.id },
  });

  if (!contact) throw new NotFoundError('Contact');

  const [conversations, orders, meetings] = await Promise.all([
    prisma.conversation.findMany({
      where: { tenantId: contact.tenantId, callerPhone: contact.phone },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, flowType: true, createdAt: true, messages: true },
    }),
    prisma.order.findMany({
      where: { tenantId: contact.tenantId, callerPhone: contact.phone },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, orderNumber: true, total: true, status: true, createdAt: true },
    }),
    prisma.meeting.findMany({
      where: { tenantId: contact.tenantId, callerPhone: contact.phone },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, scheduledAt: true, status: true, createdAt: true },
    }),
  ]);

  const activities = [
    ...conversations.map((c) => {
      const msgs = Array.isArray(c.messages) ? c.messages as Array<{ role: string; content: string }> : [];
      const lastMsg = msgs[msgs.length - 1];
      return {
        type: 'conversation' as const,
        id: c.id,
        summary: lastMsg ? `${lastMsg.role === 'user' ? 'Customer' : 'Bot'}: ${String(lastMsg.content).slice(0, 80)}` : 'SMS conversation',
        occurredAt: c.createdAt.toISOString(),
      };
    }),
    ...orders.map((o) => ({
      type: 'order' as const,
      id: o.id,
      orderNumber: o.orderNumber,
      total: Number(o.total),
      status: o.status,
      occurredAt: o.createdAt.toISOString(),
    })),
    ...meetings.map((m) => ({
      type: 'meeting' as const,
      id: m.id,
      scheduledAt: m.scheduledAt?.toISOString() ?? null,
      status: m.status,
      occurredAt: m.createdAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  sendSuccess(res, { activities });
});

// GET /contacts/:id/notes
router.get('/:id/notes', requireAuth, async (req: Request, res: Response) => {
  const contact = await prisma.contact.findUnique({ where: { id: req.params.id } });
  if (!contact) throw new NotFoundError('Contact');

  const notes = await prisma.contactNote.findMany({
    where: { contactId: req.params.id },
    orderBy: { createdAt: 'desc' },
  });

  sendSuccess(res, notes);
});

// POST /contacts/:id/notes
router.post('/:id/notes', requireAuth, async (req: Request, res: Response) => {
  const NoteSchema = z.object({ body: z.string().min(1).max(5000) });
  const { body } = NoteSchema.parse(req.body);

  const contact = await prisma.contact.findUnique({ where: { id: req.params.id } });
  if (!contact) throw new NotFoundError('Contact');

  const note = await prisma.contactNote.create({
    data: {
      contactId: req.params.id,
      tenantId: contact.tenantId,
      body,
    },
  });

  logger.info('Contact note added', { contactId: req.params.id, noteId: note.id });
  sendCreated(res, note);
});

// DELETE /contacts/:id/notes/:noteId
router.delete('/:id/notes/:noteId', requireAuth, async (req: Request, res: Response) => {
  const note = await prisma.contactNote.findFirst({
    where: { id: req.params.noteId, contactId: req.params.id },
  });

  if (!note) throw new NotFoundError('ContactNote');

  await prisma.contactNote.delete({ where: { id: req.params.noteId } });

  logger.info('Contact note deleted', { contactId: req.params.id, noteId: req.params.noteId });
  sendSuccess(res, { deleted: true });
});

// POST /contacts/:id/sms — send a manual SMS to a contact
router.post('/:id/sms', requireAuth, async (req: Request, res: Response) => {
  const SmsSchema = z.object({ message: z.string().min(1).max(1600) });
  const { message } = SmsSchema.parse(req.body);

  const contact = await prisma.contact.findUnique({ where: { id: req.params.id } });
  if (!contact) throw new NotFoundError('Contact');

  const { sendSms } = await import('../services/twilioService');
  await sendSms(contact.tenantId, contact.phone, message);

  await prisma.contact.update({
    where: { id: req.params.id },
    data: { lastContactAt: new Date() },
  });

  logger.info('Manual SMS sent to contact', { contactId: req.params.id, tenantId: contact.tenantId });
  sendSuccess(res, { sent: true });
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
    status: z.nativeEnum(ContactStatus).optional(),
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
      status: body.status ?? ContactStatus.LEAD,
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
    status: z.nativeEnum(ContactStatus).optional(),
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
      ...(body.status !== undefined && { status: body.status }),
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
