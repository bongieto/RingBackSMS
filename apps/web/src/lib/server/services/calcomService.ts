import crypto from 'crypto';
import { logger } from '../logger';

const CALCOM_API_BASE = process.env.CALCOM_API_BASE?.trim() || 'https://api.cal.com/v2';

interface CalcomResponse<T> {
  status: 'success' | 'error';
  data?: T;
  error?: { message?: string; code?: string };
}

async function calcomGet<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${CALCOM_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'cal-api-version': '2024-08-13',
      Accept: 'application/json',
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn('[calcom] request failed', { path, status: res.status, body });
    throw new Error(
      (body as CalcomResponse<unknown>)?.error?.message ||
        `cal.com API error: ${res.status}`,
    );
  }
  return (body as CalcomResponse<T>).data ?? (body as T);
}

async function calcomPost<T>(
  path: string,
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${CALCOM_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'cal-api-version': '2024-08-13',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn('[calcom] request failed', {
      path,
      status: res.status,
      body,
    });
    throw new Error(
      (body as CalcomResponse<unknown>)?.error?.message ||
        `cal.com API error: ${res.status}`,
    );
  }
  return (body as CalcomResponse<T>).data ?? (body as T);
}

// ── Validate + user info ──────────────────────────────────────────────────

export interface CalcomUser {
  id: number;
  email: string;
  name: string | null;
  username: string | null;
  timeZone: string | null;
}

export async function validateApiKey(apiKey: string): Promise<CalcomUser> {
  // cal.com v2 exposes /me for the authenticated user.
  const data = await calcomGet<{
    id: number;
    email: string;
    name?: string | null;
    username?: string | null;
    timeZone?: string | null;
  }>('/me', apiKey);
  return {
    id: data.id,
    email: data.email,
    name: data.name ?? null,
    username: data.username ?? null,
    timeZone: data.timeZone ?? null,
  };
}

// ── Event types ───────────────────────────────────────────────────────────

export interface CalcomEventType {
  id: number;
  slug: string;
  title: string;
  lengthInMinutes: number;
}

export async function listEventTypes(apiKey: string): Promise<CalcomEventType[]> {
  const data = await calcomGet<{
    eventTypeGroups?: Array<{ eventTypes?: Array<Record<string, unknown>> }>;
    eventTypes?: Array<Record<string, unknown>>;
  }>('/event-types', apiKey);
  // Response shape varies — flatten both forms.
  const raw: Array<Record<string, unknown>> = [];
  if (Array.isArray(data.eventTypes)) raw.push(...data.eventTypes);
  if (Array.isArray(data.eventTypeGroups)) {
    for (const g of data.eventTypeGroups) {
      if (Array.isArray(g.eventTypes)) raw.push(...g.eventTypes);
    }
  }
  return raw
    .filter((e) => typeof e.id === 'number' && typeof e.slug === 'string')
    .map((e) => ({
      id: e.id as number,
      slug: e.slug as string,
      title: (e.title as string) ?? (e.slug as string),
      lengthInMinutes:
        (e.lengthInMinutes as number) ?? (e.length as number) ?? 30,
    }));
}

// ── Slots ─────────────────────────────────────────────────────────────────

export interface CalcomSlot {
  start: string; // ISO
  end: string;   // ISO
}

export async function listAvailableSlots(
  apiKey: string,
  eventTypeId: number,
  startUtc: string,
  endUtc: string,
  timeZone: string,
): Promise<CalcomSlot[]> {
  const params = new URLSearchParams({
    eventTypeId: String(eventTypeId),
    start: startUtc,
    end: endUtc,
    timeZone,
  });
  const data = await calcomGet<{
    slots?: Record<string, Array<{ start: string; end?: string }>> | Array<{ start: string; end?: string }>;
  }>(`/slots?${params.toString()}`, apiKey);

  const slots: CalcomSlot[] = [];
  if (Array.isArray(data.slots)) {
    for (const s of data.slots) slots.push({ start: s.start, end: s.end ?? s.start });
  } else if (data.slots && typeof data.slots === 'object') {
    for (const day of Object.values(data.slots)) {
      for (const s of day) slots.push({ start: s.start, end: s.end ?? s.start });
    }
  }
  return slots;
}

// ── Create booking ────────────────────────────────────────────────────────

export interface CreateBookingInput {
  eventTypeId: number;
  start: string; // ISO
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string;
  notes?: string;
  timeZone: string;
  metadata?: Record<string, string>;
}

export interface CalcomBooking {
  id: number;
  uid: string;
  status: string;
  url?: string;
}

export async function createBooking(
  apiKey: string,
  input: CreateBookingInput,
): Promise<CalcomBooking> {
  const data = await calcomPost<{
    id: number;
    uid: string;
    status?: string;
    meetingUrl?: string;
  }>('/bookings', apiKey, {
    eventTypeId: input.eventTypeId,
    start: input.start,
    attendee: {
      name: input.attendeeName,
      email: input.attendeeEmail,
      timeZone: input.timeZone,
      phoneNumber: input.attendeePhone,
      language: 'en',
    },
    metadata: input.metadata ?? {},
    ...(input.notes ? { notes: input.notes } : {}),
  });
  return {
    id: data.id,
    uid: data.uid,
    status: data.status ?? 'ACCEPTED',
    url: data.meetingUrl,
  };
}

// ── Cancel / reschedule ───────────────────────────────────────────────────

export async function cancelBooking(
  apiKey: string,
  bookingUid: string,
  reason?: string,
): Promise<void> {
  await calcomPost<unknown>(`/bookings/${bookingUid}/cancel`, apiKey, {
    cancellationReason: reason ?? 'Cancelled from RingbackSMS',
  });
}

export async function rescheduleBooking(
  apiKey: string,
  bookingUid: string,
  startUtc: string,
): Promise<{ uid: string }> {
  const data = await calcomPost<{ uid: string }>(
    `/bookings/${bookingUid}/reschedule`,
    apiKey,
    { start: startUtc },
  );
  return { uid: data.uid };
}

// ── Webhook signature verification ────────────────────────────────────────

export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.CALCOM_WEBHOOK_SECRET?.trim();
  if (!secret || !signatureHeader) return false;
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(typeof rawBody === 'string' ? rawBody : rawBody)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
