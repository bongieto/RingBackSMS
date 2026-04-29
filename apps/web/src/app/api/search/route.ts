import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { decryptMaybePlaintext, hashForSearch } from '@/lib/server/encryption';
import { logTiming, startTimer } from '@/lib/server/perf';

const SearchSchema = z.object({
  q: z.string().min(1).max(100),
  tenantId: z.string().uuid(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const timer = startTimer();
  try {
    const params = new URL(request.url).searchParams;
    const { q, tenantId } = SearchSchema.parse({
      q: params.get('q'),
      tenantId: params.get('tenantId'),
    });
    const authResult = await verifyTenantAccess(tenantId);
    if (isNextResponse(authResult)) return authResult;

    const needle = q.trim().toLowerCase();
    const searchHash = hashForSearch(needle, tenantId);
    const digits = q.replace(/\D/g, '');
    const phoneNeedle = digits.length >= 3 ? digits : q;
    const contactWhere: Prisma.ContactWhereInput = {
      tenantId,
      OR: [
        { phone: { contains: phoneNeedle } },
        ...(searchHash
          ? [
              { nameSearchHash: searchHash },
              { emailSearchHash: searchHash },
            ]
          : []),
      ],
    };

    // Name & email are encrypted at rest. Deterministic per-tenant HMAC
    // columns give us fast exact-match lookup; the small fallback keeps
    // legacy rows searchable until they are backfilled.
    const [hashedContacts, legacyContactSlice, conversations, orders] = await Promise.all([
      prisma.contact.findMany({
        where: contactWhere,
        select: { id: true, name: true, phone: true, email: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      prisma.contact.findMany({
        where: {
          tenantId,
          OR: [
            { nameSearchHash: null },
            { emailSearchHash: null },
          ],
        },
        select: { id: true, name: true, phone: true, email: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.conversation.findMany({
        where: {
          tenantId,
          callerPhone: { contains: phoneNeedle },
        },
        select: { id: true, callerPhone: true, flowType: true, createdAt: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.findMany({
        where: {
          tenantId,
          OR: [
            { orderNumber: { contains: q, mode: 'insensitive' } },
            { callerPhone: { contains: phoneNeedle } },
          ],
        },
        select: { id: true, orderNumber: true, callerPhone: true, status: true, total: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const contactById = new Map(
      [...hashedContacts, ...legacyContactSlice]
      .map((c) => ({
        ...c,
        name: decryptMaybePlaintext(c.name),
        email: decryptMaybePlaintext(c.email),
      }))
      .filter((c) => c.phone.includes(phoneNeedle) || c.name?.toLowerCase() === needle || c.email?.toLowerCase() === needle)
      .map((c) => [c.id, c] as const),
    );

    if (contactById.size < 5) {
      for (const c of legacyContactSlice
        .map((contact) => ({
          ...contact,
          name: decryptMaybePlaintext(contact.name),
          email: decryptMaybePlaintext(contact.email),
        }))
      .filter(
        (contact) =>
          (contact.name && contact.name.toLowerCase().includes(needle)) ||
          (contact.email && contact.email.toLowerCase().includes(needle)),
      )) {
        contactById.set(c.id, c);
        if (contactById.size >= 5) break;
      }
    }

    const contacts = [...contactById.values()]
      .slice(0, 5)
      .map(({ email: _e, ...rest }) => rest);

    logTiming('Global search API completed', timer, {
      tenantId,
      queryLen: q.length,
      contacts: contacts.length,
      hashedContactCandidates: hashedContacts.length,
      legacyContactCandidates: legacyContactSlice.length,
      conversations: conversations.length,
      orders: orders.length,
    });

    return apiSuccess({
      contacts: contacts.map((c) => ({ ...c, type: 'contact' as const })),
      conversations: conversations.map((c) => ({ ...c, type: 'conversation' as const })),
      orders: orders.map((o) => ({ ...o, type: 'order' as const })),
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return apiError('Invalid request', 422);
    logTiming('Global search API failed', timer, { err: err?.message ?? String(err) });
    return apiError('Internal server error', 500);
  }
}
