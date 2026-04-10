import { prisma } from '../db';
import { logger } from '../logger';
import { sendSms } from './twilioService';
import { sendNotification } from './notificationService';

const HOLDING_MESSAGE =
  "Let me get someone from our team — hang tight!";

/**
 * Checks the inbound message against the tenant's industry escalation
 * keywords + any custom keywords. If a match is found:
 * 1. Sends a holding message to the customer
 * 2. Notifies the tenant via all configured channels
 * 3. Logs the escalation event
 *
 * Returns true if an escalation was triggered, false otherwise.
 */
export async function checkEscalation(
  tenantId: string,
  callerPhone: string,
  message: string,
  conversationId?: string | null,
): Promise<boolean> {
  const config = await prisma.tenantConfig.findUnique({
    where: { tenantId },
    select: {
      industryTemplateKey: true,
      customEscalationKeywords: true,
    },
  });
  if (!config) return false;

  // Gather keywords: industry template defaults + tenant custom
  let allKeywords: string[] = [...(config.customEscalationKeywords ?? [])];

  if (config.industryTemplateKey) {
    const template = await prisma.industryTemplate.findUnique({
      where: { industryKey: config.industryTemplateKey },
      select: { escalationKeywords: true },
    });
    if (template) {
      allKeywords = [...allKeywords, ...template.escalationKeywords];
    }
  }

  if (allKeywords.length === 0) return false;

  const lower = message.toLowerCase();
  const triggerKeyword = allKeywords.find((kw) =>
    lower.includes(kw.toLowerCase()),
  );

  if (!triggerKeyword) return false;

  // Escalation triggered
  logger.info('Escalation triggered', { tenantId, triggerKeyword });

  // 1. Send holding message to customer
  await sendSms(tenantId, callerPhone, HOLDING_MESSAGE).catch((err) =>
    logger.error('Failed to send escalation holding message', { err, tenantId }),
  );

  // 2. Notify tenant via all configured channels
  await sendNotification({
    tenantId,
    subject: `Escalation: customer needs help`,
    message: `A customer (${callerPhone}) triggered an escalation with keyword "${triggerKeyword}". Message: "${message.substring(0, 200)}"`,
    channel: 'email',
  }).catch((err) =>
    logger.warn('Escalation email notification failed', { err, tenantId }),
  );

  // 3. Log the event
  await prisma.escalationEvent.create({
    data: {
      tenantId,
      callerPhone,
      conversationId: conversationId ?? null,
      triggerKeyword,
      messageBody: message,
    },
  });

  return true;
}
