import { Resend } from 'resend';
import { Plan } from '@ringback/shared-types';
import { logger } from '../logger';
import { prisma } from '../db';
import {
  welcomeEmail,
  subscriptionCancelledEmail,
  paymentFailedEmail,
  usageLimitWarningEmail,
  weeklyDigestEmail,
  meetingConfirmationEmail,
  meetingRequestEmail,
  dailyTaskDigestEmail,
  agencyApprovedEmail,
  agencyRejectedEmail,
  payoutConfirmationEmail,
  tenantOwnerInviteEmail,
} from './emailTemplates';

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM = process.env.RESEND_FROM_EMAIL ?? 'RingbackSMS <info@ringbacksms.com>';

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const resend = getResend();
    await resend.emails.send({ from: FROM, to, subject, html });
    logger.info('Email sent', { to, subject });
    return true;
  } catch (error) {
    logger.error('Email send failed', { error, to, subject });
    return false;
  }
}

async function getTenantEmail(tenantId: string): Promise<{ email: string | null; name: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { config: true },
  });
  return {
    email: tenant?.config?.ownerEmail ?? null,
    name: tenant?.name ?? 'there',
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(tenantId: string, plan: Plan): Promise<void> {
  const { email, name } = await getTenantEmail(tenantId);
  if (!email) return;
  const { subject, html } = welcomeEmail(name, plan);
  await sendEmail(email, subject, html);
}

export async function sendSubscriptionCancelledEmail(tenantId: string): Promise<void> {
  const { email, name } = await getTenantEmail(tenantId);
  if (!email) return;
  const { subject, html } = subscriptionCancelledEmail(name);
  await sendEmail(email, subject, html);
}

export async function sendPaymentFailedEmail(tenantId: string): Promise<void> {
  const { email, name } = await getTenantEmail(tenantId);
  if (!email) return;
  const { subject, html } = paymentFailedEmail(name);
  await sendEmail(email, subject, html);
}

export async function sendUsageLimitWarningEmail(
  tenantId: string,
  usedCount: number,
  limitCount: number
): Promise<void> {
  const { email, name } = await getTenantEmail(tenantId);
  if (!email) return;
  const { subject, html } = usageLimitWarningEmail(name, usedCount, limitCount);
  await sendEmail(email, subject, html);
}

export async function sendWeeklyDigestEmail(
  tenantId: string,
  stats: {
    missedCalls: number;
    conversations: number;
    orders: number;
    meetings: number;
    revenue: number;
  }
): Promise<void> {
  const { email, name } = await getTenantEmail(tenantId);
  if (!email) return;
  const { subject, html } = weeklyDigestEmail(name, stats);
  await sendEmail(email, subject, html);
}

export async function sendMeetingConfirmationEmail(
  tenantId: string,
  meeting: { callerPhone: string; scheduledAt: string; notes?: string | null }
): Promise<void> {
  const { email, name } = await getTenantEmail(tenantId);
  if (!email) return;
  const { subject, html } = meetingConfirmationEmail(name, meeting);
  await sendEmail(email, subject, html);
}

export async function sendDailyTaskDigestEmail(
  tenantId: string,
  tasks: Array<{
    id: string;
    title: string;
    priority: 'URGENT' | 'HIGH' | 'NORMAL';
    source: string;
    callerPhone?: string | null;
    createdAt: Date | string;
  }>
): Promise<boolean> {
  const { email, name } = await getTenantEmail(tenantId);
  if (!email) return false;
  const { subject, html } = dailyTaskDigestEmail(name, tasks);
  return sendEmail(email, subject, html);
}

export async function sendMeetingRequestEmail(
  tenantId: string,
  meeting: { callerPhone: string; scheduledAt: string; notes?: string | null }
): Promise<void> {
  const { email, name } = await getTenantEmail(tenantId);
  if (!email) return;
  const { subject, html } = meetingRequestEmail(name, meeting);
  await sendEmail(email, subject, html);
}

// ── Agency partner emails ───────────────────────────────────────────────────

export async function sendAgencyApprovedEmail(
  toEmail: string,
  name: string,
): Promise<void> {
  const { subject, html } = agencyApprovedEmail(name);
  await sendEmail(toEmail, subject, html);
}

export async function sendAgencyRejectedEmail(
  toEmail: string,
  name: string,
  reason?: string | null,
): Promise<void> {
  const { subject, html } = agencyRejectedEmail(name, reason);
  await sendEmail(toEmail, subject, html);
}

export async function sendPayoutEmail(
  toEmail: string,
  name: string,
  amountCents: number,
  periodLabel: string,
): Promise<void> {
  const { subject, html } = payoutConfirmationEmail(name, amountCents, periodLabel);
  await sendEmail(toEmail, subject, html);
}

export async function sendTenantOwnerInviteEmail(
  toEmail: string,
  tenantName: string,
  inviterName: string,
): Promise<void> {
  const { subject, html } = tenantOwnerInviteEmail(tenantName, inviterName);
  await sendEmail(toEmail, subject, html);
}
