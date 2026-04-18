import { prisma } from '../db';
import { sendSms } from './twilioService';
import { logger } from '../logger';

/**
 * Queue every eligible contact as a recipient for this campaign. Eligibility:
 *   - Same tenant
 *   - not suppressed (TCPA — respects STOP)
 *   - has a phone number
 *
 * We snapshot at queue-time but re-check suppressed at send-time as well,
 * so someone who texts STOP after the campaign is queued still gets
 * excluded.
 */
export async function queueCampaign(campaignId: string): Promise<{ queued: number }> {
  const campaign = await prisma.smsCampaign.findUnique({
    where: { id: campaignId },
    select: { tenantId: true, status: true },
  });
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status !== 'DRAFT' && campaign.status !== 'QUEUED') {
    throw new Error(`Campaign is ${campaign.status}, cannot queue`);
  }

  const contacts = await prisma.contact.findMany({
    where: {
      tenantId: campaign.tenantId,
      suppressed: false,
      phone: { not: '' },
    },
    select: { id: true, phone: true },
  });

  // Dedup on phone — a contact might be listed twice via different ids.
  const seen = new Set<string>();
  const rows: Array<{ campaignId: string; contactId: string; phone: string }> = [];
  for (const c of contacts) {
    if (seen.has(c.phone)) continue;
    seen.add(c.phone);
    rows.push({ campaignId, contactId: c.id, phone: c.phone });
  }

  if (rows.length === 0) {
    await prisma.smsCampaign.update({
      where: { id: campaignId },
      data: { status: 'QUEUED' },
    });
    return { queued: 0 };
  }

  await prisma.smsCampaignRecipient.createMany({ data: rows, skipDuplicates: true });
  await prisma.smsCampaign.update({
    where: { id: campaignId },
    data: { status: 'QUEUED' },
  });
  return { queued: rows.length };
}

/**
 * Send all PENDING recipients for a campaign. Rechecks Contact.suppressed
 * at send-time — someone who texted STOP between queue and send is skipped.
 * Appends a standard compliance footer to every outbound message so we
 * stay TCPA-clean even if the operator forgets.
 */
export async function sendCampaign(campaignId: string): Promise<{
  sent: number;
  suppressed: number;
  failed: number;
}> {
  const campaign = await prisma.smsCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, tenantId: true, body: true, status: true },
  });
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'SENT' || campaign.status === 'CANCELLED') {
    throw new Error(`Campaign is ${campaign.status}`);
  }

  await prisma.smsCampaign.update({
    where: { id: campaignId },
    data: { status: 'SENDING' },
  });

  // If this tenant has any in-flight consent signals, we respect them by
  // re-reading Contact.suppressed at send-time rather than trusting the
  // queued recipient row.
  const recipients = await prisma.smsCampaignRecipient.findMany({
    where: { campaignId, status: 'PENDING' },
    select: { id: true, phone: true },
  });

  const suppressedPhones = new Set(
    (
      await prisma.contact.findMany({
        where: { tenantId: campaign.tenantId, suppressed: true },
        select: { phone: true },
      })
    ).map((c) => c.phone),
  );

  const body = campaign.body.includes('STOP')
    ? campaign.body
    : `${campaign.body}\n\nReply STOP to opt out.`;

  let sent = 0;
  let suppressed = 0;
  let failed = 0;

  // Drip-send one at a time. Twilio's API can easily do bursts but most
  // A2P providers rate-limit 1 msg/sec per long code — keep it tidy.
  for (const r of recipients) {
    if (suppressedPhones.has(r.phone)) {
      await prisma.smsCampaignRecipient.update({
        where: { id: r.id },
        data: { status: 'SUPPRESSED' },
      });
      suppressed += 1;
      continue;
    }
    try {
      await sendSms(campaign.tenantId, r.phone, body);
      await prisma.smsCampaignRecipient.update({
        where: { id: r.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      sent += 1;
    } catch (err: any) {
      failed += 1;
      await prisma.smsCampaignRecipient.update({
        where: { id: r.id },
        data: { status: 'FAILED', error: err?.message ?? 'send failed' },
      });
      logger.warn('Campaign send failed for recipient', {
        campaignId,
        phone: r.phone,
        err: err?.message,
      });
    }
  }

  await prisma.smsCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'SENT',
      sentAt: new Date(),
      sentCount: sent,
      suppressedCount: suppressed,
      failedCount: failed,
    },
  });

  return { sent, suppressed, failed };
}
