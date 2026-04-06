import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { sendNotification, NotificationChannel } from '@/lib/server/services/notificationService';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';

const TestSchema = z.object({
  tenantId: z.string().uuid(),
  channel: z.enum(['email', 'sms', 'slack']),
});

export async function POST(req: NextRequest) {
  try {
    const { tenantId, channel } = TestSchema.parse(await req.json());
    const authResult = await verifyTenantAccess(tenantId);
    if (isNextResponse(authResult)) return authResult;

    await sendNotification({
      tenantId,
      subject: 'Test notification from RingBack',
      message: `This is a test ${channel} notification. If you received this, your ${channel} notifications are configured correctly!`,
      channel: channel as NotificationChannel,
    });

    return apiSuccess({ sent: true, channel });
  } catch (err: any) {
    if (err instanceof z.ZodError) return apiError('Invalid request', 422);
    return apiError('Internal server error', 500);
  }
}
