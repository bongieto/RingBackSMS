import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient, MeetingStatus } from '@prisma/client';
import { requireAuth, requireOrgAuth } from '../middleware/authMiddleware';
import { sendSuccess, sendCreated, sendError, sendPaginated } from '../utils/response';
import { NotFoundError, ValidationError } from '../utils/errors';

const router: Router = Router();
const prisma = new PrismaClient();

// ── Validation schemas ───────────────────────────────────────────────────────

const CreateMeetingSchema = z.object({
  tenantId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  callerPhone: z.string().min(1),
  scheduledAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const UpdateMeetingSchema = z.object({
  status: z.nativeEnum(MeetingStatus).optional(),
  scheduledAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate that a requested meeting time falls within the tenant's
 * configured business hours and business days.
 */
async function validateBusinessHours(tenantId: string, scheduledAt: string): Promise<void> {
  const config = await prisma.tenantConfig.findUnique({ where: { tenantId } });
  if (!config) return; // no config means no restrictions

  const date = new Date(scheduledAt);

  // Check business day (0 = Sunday, 6 = Saturday)
  const dayOfWeek = date.getDay();
  if (config.businessDays.length > 0 && !config.businessDays.includes(dayOfWeek)) {
    throw new ValidationError(
      `Meetings cannot be scheduled on this day. Business days: ${config.businessDays.join(', ')}`
    );
  }

  // Check business hours
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

  if (timeStr < config.businessHoursStart || timeStr >= config.businessHoursEnd) {
    throw new ValidationError(
      `Meetings must be scheduled between ${config.businessHoursStart} and ${config.businessHoursEnd}`
    );
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /meetings?tenantId=&status=&from=&to=&page=&pageSize=
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  const status = req.query.status as MeetingStatus | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const page = parseInt(req.query.page as string ?? '1', 10);
  const pageSize = parseInt(req.query.pageSize as string ?? '20', 10);

  const where = {
    tenantId,
    ...(status && { status }),
    ...(from || to
      ? {
          scheduledAt: {
            ...(from && { gte: new Date(from) }),
            ...(to && { lte: new Date(to) }),
          },
        }
      : {}),
  };

  const [meetings, total] = await Promise.all([
    prisma.meeting.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { conversation: true },
    }),
    prisma.meeting.count({ where }),
  ]);

  sendPaginated(res, meetings, total, page, pageSize);
});

// GET /meetings/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    include: { conversation: true },
  });

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  sendSuccess(res, meeting);
});

// POST /meetings — create a new meeting
router.post('/', requireOrgAuth, async (req: Request, res: Response) => {
  const body = CreateMeetingSchema.parse(req.body);

  // Validate business hours if scheduledAt is provided
  if (body.scheduledAt) {
    await validateBusinessHours(body.tenantId, body.scheduledAt);
  }

  // If no conversationId provided, find or create a conversation for this phone
  let conversationId = body.conversationId;
  if (!conversationId) {
    const existing = await prisma.conversation.findFirst({
      where: { tenantId: body.tenantId, callerPhone: body.callerPhone, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      conversationId = existing.id;
    } else {
      const conversation = await prisma.conversation.create({
        data: {
          tenantId: body.tenantId,
          callerPhone: body.callerPhone,
          flowType: 'MEETING',
          isActive: true,
        },
      });
      conversationId = conversation.id;
    }
  }

  const meeting = await prisma.meeting.create({
    data: {
      tenantId: body.tenantId,
      conversationId,
      callerPhone: body.callerPhone,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      notes: body.notes,
      status: 'PENDING',
    },
    include: { conversation: true },
  });

  sendCreated(res, meeting);
});

// PATCH /meetings/:id — update meeting (status, scheduledAt, notes)
router.patch('/:id', requireOrgAuth, async (req: Request, res: Response) => {
  const body = UpdateMeetingSchema.parse(req.body);

  const existing = await prisma.meeting.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new NotFoundError('Meeting');
  }

  // Validate business hours if scheduledAt is being updated
  if (body.scheduledAt) {
    await validateBusinessHours(existing.tenantId, body.scheduledAt);
  }

  const meeting = await prisma.meeting.update({
    where: { id: req.params.id },
    data: {
      ...(body.status && { status: body.status }),
      ...(body.scheduledAt && { scheduledAt: new Date(body.scheduledAt) }),
      ...(body.notes !== undefined && { notes: body.notes }),
    },
    include: { conversation: true },
  });

  sendSuccess(res, meeting);
});

// DELETE /meetings/:id — cancel a meeting
router.delete('/:id', requireOrgAuth, async (req: Request, res: Response) => {
  const existing = await prisma.meeting.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new NotFoundError('Meeting');
  }

  const meeting = await prisma.meeting.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED' },
    include: { conversation: true },
  });

  sendSuccess(res, meeting);
});

export default router;
