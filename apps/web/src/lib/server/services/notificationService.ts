import { Resend } from 'resend';
import { logger } from '../logger';
import { maskPhone } from '../phoneUtils';
import { sendSms } from './twilioService';
import { prisma } from '../db';

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export type NotificationChannel = 'email' | 'sms' | 'slack';
export type NotificationPriority = 'NORMAL' | 'HIGH';

export interface NotificationPayload {
  tenantId: string;
  subject: string;
  message: string;
  channel: NotificationChannel;
  priority?: NotificationPriority;
}

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  const config = await prisma.tenantConfig.findUnique({
    where: { tenantId: payload.tenantId },
  });

  if (!config) {
    logger.warn('No config for tenant notification', { tenantId: payload.tenantId });
    return;
  }

  switch (payload.channel) {
    case 'email':
      if (config.ownerEmail) {
        await sendEmailNotification(config.ownerEmail, payload.subject, payload.message);
      }
      break;

    case 'sms':
      if (config.ownerPhone) {
        try {
          await sendSms(payload.tenantId, config.ownerPhone, `${payload.subject}\n${payload.message}`);
        } catch (error) {
          logger.error('SMS notification failed', { error, tenantId: payload.tenantId });
        }
      }
      break;

    case 'slack':
      if (config.slackWebhook) {
        await sendSlackNotification(config.slackWebhook, payload.subject, payload.message);
      }
      break;
  }
}

async function sendEmailNotification(
  to: string,
  subject: string,
  message: string
): Promise<void> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL ?? 'noreply@ringback.app';

  try {
    await resend.emails.send({
      from,
      to,
      subject: `[RingBack] ${subject}`,
      text: message,
      html: `<pre style="font-family:sans-serif">${message.replace(/\n/g, '<br>')}</pre>`,
    });
    logger.debug('Email notification sent', { to: maskPhone(to) });
  } catch (error) {
    logger.error('Email notification failed', { error });
  }
}

async function sendSlackNotification(
  webhookUrl: string,
  subject: string,
  message: string
): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `*${subject}*\n${message}`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook returned ${response.status}`);
    }
  } catch (error) {
    logger.error('Slack notification failed', { error });
  }
}

/**
 * Fans a high-priority alert out to every channel the tenant has configured
 * (SMS to ownerPhone + Slack with @channel mention + email). Used for things
 * like rapid-redial detection where the owner needs to act now.
 */
export async function sendHighPriorityAlert(payload: {
  tenantId: string;
  subject: string;
  message: string;
}): Promise<void> {
  const config = await prisma.tenantConfig.findUnique({
    where: { tenantId: payload.tenantId },
  });
  if (!config) {
    logger.warn('No config for high-priority alert', { tenantId: payload.tenantId });
    return;
  }

  const subject = `🔥 URGENT — ${payload.subject}`;

  const tasks: Promise<unknown>[] = [];

  if (config.ownerPhone) {
    tasks.push(
      sendSms(payload.tenantId, config.ownerPhone, `${subject}\n${payload.message}`).catch(
        (error) => logger.error('High-priority SMS failed', { error, tenantId: payload.tenantId })
      )
    );
  }

  if (config.slackWebhook) {
    tasks.push(
      fetch(config.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `<!channel> *${subject}*\n${payload.message}`,
        }),
      }).catch((error) =>
        logger.error('High-priority Slack failed', { error, tenantId: payload.tenantId })
      )
    );
  }

  if (config.ownerEmail) {
    tasks.push(
      sendEmailNotification(config.ownerEmail, subject, payload.message).catch((error) =>
        logger.error('High-priority email failed', { error, tenantId: payload.tenantId })
      )
    );
  }

  await Promise.all(tasks);
}

export async function sendMissedCallAlert(
  tenantId: string,
  callerPhone: string,
  missedCallId: string
): Promise<void> {
  await sendNotification({
    tenantId,
    subject: `Missed call from ${maskPhone(callerPhone)}`,
    message: `A customer called and we auto-responded via SMS. Conversation ID: ${missedCallId}`,
    channel: 'email',
  });
}
