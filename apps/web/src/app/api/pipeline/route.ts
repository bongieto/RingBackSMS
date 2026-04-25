import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { decryptMaybePlaintext } from '@/lib/server/encryption';

/**
 * Lead pipeline aggregator.
 *
 * A "lead" = a unique (tenantId, callerPhone) with activity in the last
 * `LOOKBACK_DAYS` days. We pull the latest meeting, conversation, and
 * missed call per phone, then bucket each lead into one of six stages.
 *
 * Stage rules (first match wins):
 *   1. completed  — most recent meeting status = COMPLETED
 *   2. confirmed  — meeting status = CONFIRMED AND confirmedAt is set
 *   3. booked     — meeting status = PENDING, or CONFIRMED with no
 *                    customer reply yet (confirmedAt = null)
 *   4. lost       — meeting status = CANCELLED OR last activity > 30d ago
 *   5. engaged    — active conversation, no meeting yet
 *   6. new        — missed call in last 7d, no conversation yet
 *
 * Returns stages in display order with caller details and the most
 * recent timestamp so the UI can show "X hours ago".
 */

const LOOKBACK_DAYS = 60;
const NEW_LEAD_DAYS = 7;
const LOST_AGE_DAYS = 30;
const PER_STAGE_LIMIT = 50;

type Stage = 'new' | 'engaged' | 'booked' | 'confirmed' | 'completed' | 'lost';

interface LeadCard {
  callerPhone: string;
  name: string | null;
  lastTouchAt: string;        // ISO
  conversationId: string | null;
  meetingId: string | null;
  scheduledAt: string | null; // ISO, only when there's a meeting
  summary: string;            // one-line context for the card
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId is required', 400);

  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const now = new Date();
  const lookbackStart = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const newLeadCutoff = new Date(now.getTime() - NEW_LEAD_DAYS * 24 * 60 * 60 * 1000);
  const lostCutoff = new Date(now.getTime() - LOST_AGE_DAYS * 24 * 60 * 60 * 1000);

  // Pull a generous slice of recent activity. We do the bucketing in JS
  // because the "latest per (callerPhone)" pattern across 3 tables is
  // gnarly in raw Prisma, and these volumes (typically <500 rows per
  // table per tenant per 60d) are tiny.
  const [missedCalls, conversations, meetings, contacts] = await Promise.all([
    prisma.missedCall.findMany({
      where: { tenantId, occurredAt: { gte: lookbackStart } },
      select: { callerPhone: true, occurredAt: true },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    }),
    prisma.conversation.findMany({
      where: { tenantId, updatedAt: { gte: lookbackStart } },
      select: {
        id: true,
        callerPhone: true,
        flowType: true,
        handoffStatus: true,
        isActive: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    }),
    prisma.meeting.findMany({
      where: { tenantId, updatedAt: { gte: lookbackStart } },
      select: {
        id: true,
        callerPhone: true,
        status: true,
        scheduledAt: true,
        confirmedAt: true,
        guestName: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    }),
    prisma.contact.findMany({
      where: { tenantId },
      select: { phone: true, name: true },
    }),
  ]);

  const nameByPhone = new Map<string, string | null>();
  for (const c of contacts) {
    nameByPhone.set(c.phone, decryptMaybePlaintext(c.name));
  }

  // Latest record per (callerPhone), since each list is already DESC.
  const latestMissed = new Map<string, (typeof missedCalls)[number]>();
  for (const m of missedCalls) {
    if (!latestMissed.has(m.callerPhone)) latestMissed.set(m.callerPhone, m);
  }
  const latestConvo = new Map<string, (typeof conversations)[number]>();
  for (const c of conversations) {
    if (!latestConvo.has(c.callerPhone)) latestConvo.set(c.callerPhone, c);
  }
  const latestMeeting = new Map<string, (typeof meetings)[number]>();
  for (const m of meetings) {
    if (!latestMeeting.has(m.callerPhone)) latestMeeting.set(m.callerPhone, m);
  }

  const phones = new Set<string>([
    ...latestMissed.keys(),
    ...latestConvo.keys(),
    ...latestMeeting.keys(),
  ]);

  const stages: Record<Stage, LeadCard[]> = {
    new: [],
    engaged: [],
    booked: [],
    confirmed: [],
    completed: [],
    lost: [],
  };

  for (const phone of phones) {
    const meeting = latestMeeting.get(phone);
    const convo = latestConvo.get(phone);
    const missed = latestMissed.get(phone);

    const lastTouch = [
      meeting?.updatedAt,
      convo?.updatedAt,
      missed?.occurredAt,
    ]
      .filter((d): d is Date => Boolean(d))
      .reduce((acc, d) => (d > acc ? d : acc), new Date(0));

    let stage: Stage;
    if (meeting?.status === 'COMPLETED') {
      stage = 'completed';
    } else if (meeting?.status === 'CONFIRMED' && meeting.confirmedAt) {
      stage = 'confirmed';
    } else if (meeting?.status === 'PENDING' || meeting?.status === 'CONFIRMED') {
      stage = 'booked';
    } else if (meeting?.status === 'CANCELLED' || lastTouch < lostCutoff) {
      stage = 'lost';
    } else if (convo) {
      stage = 'engaged';
    } else if (missed && missed.occurredAt >= newLeadCutoff) {
      stage = 'new';
    } else {
      // Stale missed call with no follow-up — bucket as lost.
      stage = 'lost';
    }

    const card: LeadCard = {
      callerPhone: phone,
      name: meeting?.guestName ?? nameByPhone.get(phone) ?? null,
      lastTouchAt: lastTouch.toISOString(),
      conversationId: convo?.id ?? null,
      meetingId: meeting?.id ?? null,
      scheduledAt: meeting?.scheduledAt?.toISOString() ?? null,
      summary: buildSummary({ stage, meeting, convo, missed }),
    };

    stages[stage].push(card);
  }

  // Sort each stage by recency desc and cap.
  for (const k of Object.keys(stages) as Stage[]) {
    stages[k].sort((a, b) => b.lastTouchAt.localeCompare(a.lastTouchAt));
    stages[k] = stages[k].slice(0, PER_STAGE_LIMIT);
  }

  const counts = Object.fromEntries(
    (Object.keys(stages) as Stage[]).map((k) => [k, stages[k].length]),
  ) as Record<Stage, number>;

  return apiSuccess({ stages, counts });
}

function buildSummary(args: {
  stage: Stage;
  meeting: { status: string; scheduledAt: Date | null; confirmedAt: Date | null } | undefined;
  convo: { flowType: string | null; handoffStatus: string; isActive: boolean } | undefined;
  missed: { occurredAt: Date } | undefined;
}): string {
  const { stage, meeting, convo, missed } = args;

  if (stage === 'completed') return 'Appointment completed';
  if (stage === 'confirmed') return 'Customer confirmed appointment';
  if (stage === 'booked') {
    if (meeting?.status === 'CONFIRMED') return 'Booked — awaiting customer confirmation';
    return 'Booked — pending';
  }
  if (stage === 'engaged') {
    if (convo?.handoffStatus === 'HUMAN') return 'Owner is handling';
    if (convo?.flowType) return `In conversation (${convo.flowType.toLowerCase()})`;
    return 'In conversation';
  }
  if (stage === 'new') return missed ? 'Missed call — bot replied' : 'New lead';
  if (stage === 'lost') {
    if (meeting?.status === 'CANCELLED') return 'Appointment cancelled';
    return 'Went cold';
  }
  return '';
}
