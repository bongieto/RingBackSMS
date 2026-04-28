import { prisma } from '../db';
import { logger } from '../logger';
import { sendSms } from './twilioService';
import { sendNotification } from './notificationService';
import { createTask } from './taskService';
import { matchEscalationPolicy, matchSafetyPolicy } from '@ringback/flow-engine';

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
          escalationPolicyOverrides: true,
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

  let templateKeywords: string[] = [];
  if (config.industryTemplateKey) {
    const template = await prisma.industryTemplate.findUnique({
      where: { industryKey: config.industryTemplateKey },
      select: { escalationKeywords: true },
    });
    if (template) {
      templateKeywords = template.escalationKeywords;
    }
  }

  const match = matchEscalationPolicy({
    businessType: tenant.businessType,
    industryTemplateKey: config.industryTemplateKey,
    tenantName: tenant.name,
    websiteContext: config.websiteContext,
    message,
    callerPhone,
    customKeywords: config.customEscalationKeywords,
    templateKeywords,
    policyOverrides: config.escalationPolicyOverrides,
  });
  if (!match) return false;

  // Escalation triggered
  logger.info('Escalation triggered', {
    tenantId,
    triggerKeyword: match.triggerKeyword,
    vertical: match.profile.key,
    policyId: match.policy.id,
    severity: match.severity,
    stopAutomation: match.stopAutomation,
  });

  // 1. Send holding message to customer
  if (match.stopAutomation) {
    await sendSms(tenantId, callerPhone, match.customerReply).catch((err) =>
      logger.error('Failed to send escalation holding message', { err, tenantId }),
    );
  }

  // 2. Notify tenant via all configured channels
  await sendNotification({
    tenantId,
    subject: match.ownerSubject,
    message: match.ownerMessage,
    channel: 'email',
  }).catch((err) =>
    logger.warn('Escalation email notification failed', { err, tenantId }),
  );

  await createTask({
    tenantId,
    source: 'CONVERSATION',
    priority: match.taskPriority,
    title: match.taskTitle,
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
      triggerKeyword: match.triggerKeyword,
      messageBody: message,
    },
  });

  return match.stopAutomation;
}
