import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import { requireAuth } from '../middleware/authMiddleware';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { sendSms } from '../services/twilioService';
import { logger } from '../utils/logger';

const router: Router = Router();
const prisma = new PrismaClient();

// GET /conversations?tenantId=&page=&pageSize=
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  const page = parseInt(req.query.page as string ?? '1', 10);
  const pageSize = parseInt(req.query.pageSize as string ?? '20', 10);
  const isActive = req.query.isActive !== undefined
    ? req.query.isActive === 'true'
    : undefined;

  const where = {
    tenantId,
    ...(isActive !== undefined && { isActive }),
  };

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.conversation.count({ where }),
  ]);

  sendPaginated(res, conversations, total, page, pageSize);
});

// GET /conversations/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.id },
    include: { orders: true, meetings: true },
  });

  if (!conversation) {
    res.status(404).json({ success: false, error: 'Conversation not found' });
    return;
  }

  sendSuccess(res, conversation);
});

// POST /conversations/:id/reply
router.post('/:id/reply', requireAuth, async (req: Request, res: Response) => {
  const ReplySchema = z.object({
    message: z.string().min(1),
  });

  const body = ReplySchema.parse(req.body);

  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.id },
  });

  if (!conversation) {
    sendError(res, 'Conversation not found', 404);
    return;
  }

  // Send SMS via Twilio
  await sendSms(conversation.tenantId, conversation.callerPhone, body.message);

  // Append the message to the conversation
  const existingMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const newMessage = {
    role: 'assistant',
    content: body.message,
    timestamp: new Date().toISOString(),
  };

  const updated = await prisma.conversation.update({
    where: { id: req.params.id },
    data: {
      messages: [...existingMessages, newMessage] as unknown as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
    include: { orders: true, meetings: true },
  });

  logger.info('Manual reply sent', { conversationId: req.params.id, tenantId: conversation.tenantId });
  sendSuccess(res, updated);
});

export default router;
