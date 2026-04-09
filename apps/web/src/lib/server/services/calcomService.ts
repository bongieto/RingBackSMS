import crypto from 'crypto';
import { logger } from '../logger';
import { prisma } from '../db';
import { encrypt, decrypt, decryptNullable } from '../encryption';

const CALCOM_API_BASE = process.env.CALCOM_API_BASE?.trim() || 'https://api.cal.com/v2';
const CALCOM_WEB_BASE = process.env.CALCOM_WEB_BASE?.trim() || 'https://app.cal.com';

export const CALCOM_SCOPES = 'EVENT_TYPE_READ BOOKING_WRITE SCHEDULE_READ PROFILE_READ';

// ── Token lifecycle ────────────────────────────────────────────────────────

interface TokenPair {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

interface CalcomTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  token_type?: string;
}

/**
 * Exchange an OAuth authorization code for tokens during the /callback.
 * This is the only place we use client_id + client_secret directly — all
 * subsequent API calls use the access token per tenant.
 */
export async function exchangeAuthCode(
  code: string,
  redirectUri: string,
): Promise<TokenPair & { calcomUser: { id: number; email: string; name: string | null } }> {
  const clientId = process.env.CALCOM_CLIENT_ID?.trim();
  const clientSecret = process.env.CALCOM_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('CALCOM_CLIENT_ID / CALCOM_CLIENT_SECRET not configured');
  }

  const res = await fetch(`${CALCOM_API_BASE}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn('[calcom] token exchange failed', { status: res.status, body });
    throw new Error(
      (body as { error?: string; error_description?: string })?.error_description ??
        (body as { error?: string }).error ??
        `Token exchange failed: ${res.status}`,
    );
  }
  const tok = body as CalcomTokenResponse;
  const expiresAt = new Date(Date.now() + (tok.expires_in ?? 1800) * 1000);

  // Fetch the user profile so we can show who connected.
  const me = await fetchMe(tok.access_token);

  return {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? null,
    expiresAt,
    calcomUser: me,
  };
}

async function fetchMe(accessToken: string): Promise<{ id: number; email: string; name: string | null }> {
  const res = await fetch(`${CALCOM_API_BASE}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'cal-api-version': '2024-08-13',
      Accept: 'application/json',
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`cal.com /me failed: ${res.status}`);
  }
  const d = (body as { data?: { id: number; email: string; name?: string | null } }).data ?? body;
  return {
    id: (d as { id: number }).id,
    email: (d as { email: string }).email,
    name: (d as { name?: string | null }).name ?? null,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  const clientId = process.env.CALCOM_CLIENT_ID?.trim();
  const clientSecret = process.env.CALCOM_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('CALCOM_CLIENT_ID / CALCOM_CLIENT_SECRET not configured');
  }
  const res = await fetch(`${CALCOM_API_BASE}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn('[calcom] refresh failed', { status: res.status, body });
    throw new Error('cal.com refresh failed');
  }
  const tok = body as CalcomTokenResponse;
  return {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? refreshToken, // cal.com may rotate
    expiresAt: new Date(Date.now() + (tok.expires_in ?? 1800) * 1000),
  };
}

/**
 * Load the current tenant's cal.com access token, refreshing it first
 * if it's expired or within 60s of expiring. Persists rotated tokens
 * back to TenantConfig.
 */
async function getAccessTokenFor(tenantId: string): Promise<string> {
  const cfg = await prisma.tenantConfig.findUnique({
    where: { tenantId },
    select: {
      calcomAccessToken: true,
      calcomRefreshToken: true,
      calcomTokenExpiresAt: true,
    },
  });
  if (!cfg?.calcomAccessToken) {
    throw new Error('cal.com is not connected for this tenant');
  }

  const expiresAt = cfg.calcomTokenExpiresAt ?? new Date(0);
  const now = Date.now();
  if (expiresAt.getTime() - now > 60_000) {
    return decrypt(cfg.calcomAccessToken);
  }

  // Expired or about to expire — refresh.
  const rt = decryptNullable(cfg.calcomRefreshToken);
  if (!rt) {
    throw new Error('cal.com refresh token missing — reconnect required');
  }
  logger.info('[calcom] refreshing access token', { tenantId });
  const fresh = await refreshAccessToken(rt);
  await prisma.tenantConfig.update({
    where: { tenantId },
    data: {
      calcomAccessToken: encrypt(fresh.accessToken),
      calcomRefreshToken: fresh.refreshToken ? encrypt(fresh.refreshToken) : null,
      calcomTokenExpiresAt: fresh.expiresAt,
    },
  });
  return fresh.accessToken;
}

// ── Authenticated fetch helpers ────────────────────────────────────────────

async function calGet<T>(tenantId: string, path: string): Promise<T> {
  const accessToken = await getAccessTokenFor(tenantId);
  const res = await fetch(`${CALCOM_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'cal-api-version': '2024-08-13',
      Accept: 'application/json',
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn('[calcom] GET failed', { path, status: res.status, body });
    throw new Error(
      (body as { error?: { message?: string } })?.error?.message ??
        `cal.com API error: ${res.status}`,
    );
  }
  return ((body as { data?: T }).data ?? body) as T;
}

async function calPost<T>(
  tenantId: string,
  path: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const accessToken = await getAccessTokenFor(tenantId);
  const res = await fetch(`${CALCOM_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'cal-api-version': '2024-08-13',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn('[calcom] POST failed', { path, status: res.status, body });
    throw new Error(
      (body as { error?: { message?: string } })?.error?.message ??
        `cal.com API error: ${res.status}`,
    );
  }
  return ((body as { data?: T }).data ?? body) as T;
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface CalcomEventType {
  id: number;
  slug: string;
  title: string;
  lengthInMinutes: number;
}

export async function listEventTypes(tenantId: string): Promise<CalcomEventType[]> {
  const data = await calGet<{
    eventTypeGroups?: Array<{ eventTypes?: Array<Record<string, unknown>> }>;
    eventTypes?: Array<Record<string, unknown>>;
  }>(tenantId, '/event-types');
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

export interface CalcomSlot {
  start: string;
  end: string;
}

export async function listAvailableSlots(
  tenantId: string,
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
  const data = await calGet<{
    slots?:
      | Record<string, Array<{ start: string; end?: string }>>
      | Array<{ start: string; end?: string }>;
  }>(tenantId, `/slots?${params.toString()}`);

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

export interface CreateBookingInput {
  eventTypeId: number;
  start: string;
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
  tenantId: string,
  input: CreateBookingInput,
): Promise<CalcomBooking> {
  const data = await calPost<{
    id: number;
    uid: string;
    status?: string;
    meetingUrl?: string;
  }>(tenantId, '/bookings', {
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

export async function cancelBooking(
  tenantId: string,
  bookingUid: string,
  reason?: string,
): Promise<void> {
  await calPost<unknown>(tenantId, `/bookings/${bookingUid}/cancel`, {
    cancellationReason: reason ?? 'Cancelled from RingbackSMS',
  });
}

export async function rescheduleBooking(
  tenantId: string,
  bookingUid: string,
  startUtc: string,
): Promise<{ uid: string }> {
  const data = await calPost<{ uid: string }>(
    tenantId,
    `/bookings/${bookingUid}/reschedule`,
    { start: startUtc },
  );
  return { uid: data.uid };
}

// ── OAuth helpers ─────────────────────────────────────────────────────────

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const clientId = process.env.CALCOM_CLIENT_ID?.trim();
  if (!clientId) throw new Error('CALCOM_CLIENT_ID not configured');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: CALCOM_SCOPES,
    state,
  });
  return `${CALCOM_WEB_BASE}/auth/oauth2/authorize?${params.toString()}`;
}

/** HMAC the tenantId into a `state` param so the callback can trust it. */
export function signState(tenantId: string): string {
  const secret = process.env.CALCOM_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error('CALCOM_WEBHOOK_SECRET not configured');
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${tenantId}.${nonce}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyState(state: string): string | null {
  const secret = process.env.CALCOM_WEBHOOK_SECRET?.trim();
  if (!secret) return null;
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [tenantId, nonce, sig] = parts;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${tenantId}.${nonce}`)
    .digest('hex');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    return tenantId;
  } catch {
    return null;
  }
}

// ── Webhook signature verification (unchanged) ───────────────────────────

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
