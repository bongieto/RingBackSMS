import { prisma } from '../db';
import { logger } from '../logger';
import { sendSms } from './twilioService';
import { sendNotification } from './notificationService';
import { createTask } from './taskService';
import { getVerticalProfile, matchSafetyPolicy } from '@ringback/flow-engine';

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
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      businessType: true,
      config: {
        select: {
          industryTemplateKey: true,
          customEscalationKeywords: true,
          websiteContext: true,
        },
      },
    },
  });
  const config = tenant?.config;
  if (!config) return false;

  // Safety/emergency policies need the richer processInboundSms path so
  // customers receive the "call 911 / not an emergency service" wording.
  // Do not swallow those messages with a generic escalation hold.
  if (
    matchSafetyPolicy({
      businessType: tenant.businessType,
      industryTemplateKey: config.industryTemplateKey,
      tenantName: tenant.name,
      websiteContext: config.websiteContext,
      message,
      callerPhone,
    })
  ) {
    return false;
  }

  // Gather keywords: industry template defaults + tenant custom
  let allKeywords: string[] = [...(config.customEscalationKeywords ?? [])];
  let customerReply = HOLDING_MESSAGE;
  let severity: 'HIGH' | 'NORMAL' = 'NORMAL';

  const vertical = getVerticalProfile({
    businessType: tenant.businessType,
    industryTemplateKey: config.industryTemplateKey,
    tenantName: tenant.name,
    websiteContext: config.websiteContext,
  });
  for (const policy of vertical.escalationPolicies) {
    allKeywords = [...allKeywords, ...policy.keywords];
  }

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
  // Use word-boundary matching to avoid false positives
  // (e.g. "end" should not match "weekend" or "send")
  const wordMatch = (text: string, kw: string) =>
    new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
  const triggerKeyword = allKeywords.find((kw) => wordMatch(lower, kw));

  if (!triggerKeyword) return false;

  const matchedVerticalPolicy = vertical.escalationPolicies.find((policy) =>
    policy.keywords.some((kw) => wordMatch(lower, kw)),
  );
  if (matchedVerticalPolicy) {
    customerReply = matchedVerticalPolicy.customerReply;
    severity = matchedVerticalPolicy.severity === 'LOW' || matchedVerticalPolicy.severity === 'NORMAL' ? 'NORMAL' : 'HIGH';
  }

  // Escalation triggered
  logger.info('Escalation triggered', {
    tenantId,
    triggerKeyword,
    vertical: vertical.key,
    policyId: matchedVerticalPolicy?.id ?? null,
  });

  // 1. Send holding message to customer
  await sendSms(tenantId, callerPhone, customerReply).catch((err) =>
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

  await createTask({
    tenantId,
    source: 'CONVERSATION',
    priority: severity,
    title: `Customer follow-up needed: ${callerPhone}`,
    description: message,
    callerPhone,
    conversationId: conversationId ?? undefined,
  }).catch((err) =>
    logger.warn('Escalation task creation failed', { err, tenantId }),
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
