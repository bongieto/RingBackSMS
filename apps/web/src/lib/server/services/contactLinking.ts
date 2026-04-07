import { prisma } from '@/lib/server/db';
import { toE164 } from '@/lib/server/phoneUtils';
import { logger } from '@/lib/server/logger';

/**
 * Auto-link a missed call to a Contact, creating one if it doesn't exist.
 * Fire-and-forget — caller should not await this on the hot path.
 *
 * Behavior:
 * - Normalizes the caller phone to E.164.
 * - Upserts a Contact for (tenantId, phone). New contacts default to LEAD status.
 * - Updates `lastContactAt` on every call.
 * - Sets `MissedCall.contactId` so the voicemails query can join in O(1).
 */
export async function linkMissedCallToContact(
  tenantId: string,
  callerPhone: string,
  missedCallId: string
): Promise<string | null> {
  try {
    const e164 = toE164(callerPhone);
    if (!e164) {
      logger.warn('Could not normalize caller phone for contact linking', { callerPhone, tenantId });
      return null;
    }

    const contact = await prisma.contact.upsert({
      where: { tenantId_phone: { tenantId, phone: e164 } },
      update: { lastContactAt: new Date() },
      create: {
        tenantId,
        phone: e164,
        status: 'LEAD',
        lastContactAt: new Date(),
      },
    });

    await prisma.missedCall.update({
      where: { id: missedCallId },
      data: { contactId: contact.id },
    });

    return contact.id;
  } catch (err) {
    logger.error('Failed to link missed call to contact', { err, tenantId, missedCallId });
    return null;
  }
}
