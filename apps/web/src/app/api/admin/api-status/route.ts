import { isSuperAdmin } from '@/lib/server/agency';
import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

// Extend timeout to 30s for this route (Vercel Pro supports up to 300s)
export const maxDuration = 30;


interface ApiCheckResult {
  name: string;
  configured: boolean;
  status: 'ok' | 'error' | 'unconfigured';
  latencyMs?: number;
  error?: string;
  tenantsConnected?: number;
}

async function fetchCheck(
  url: string,
  init: RequestInit,
  timeoutMs = 5000,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err.name === 'AbortError' ? 'Timeout' : err.message,
    };
  }
}

export async function GET(_request: NextRequest) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  // Run ALL checks in parallel — use plain fetch instead of heavy SDKs
  const twilioSid = process.env.TWILIO_MASTER_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_MASTER_AUTH_TOKEN;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const minimaxKey = process.env.MINIMAX_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  const [
    dbResult,
    twilioCount,
    stripeCount,
    squareCount,
    cloverCount,
    toastCount,
    shopifyCount,
    twilioResult,
    minimaxResult,
    stripeResult,
    resendResult,
  ] = await Promise.all([
    // DB ping
    (async () => {
      const start = Date.now();
      try {
        await prisma.$queryRaw`SELECT 1`;
        return { ok: true, latencyMs: Date.now() - start };
      } catch (e: any) {
        return { ok: false, latencyMs: Date.now() - start, error: e.message };
      }
    })(),
    // Tenant counts
    prisma.tenant.count({ where: { twilioSubAccountSid: { not: null } } }),
    prisma.tenant.count({ where: { stripeCustomerId: { not: null } } }),
    prisma.tenant.count({ where: { posProvider: 'square' } }),
    prisma.tenant.count({ where: { posProvider: 'clover' } }),
    prisma.tenant.count({ where: { posProvider: 'toast' } }),
    prisma.tenant.count({ where: { posProvider: 'shopify' } }),
    // Twilio — plain REST, no SDK import
    twilioSid && twilioToken
      ? fetchCheck(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}.json`,
          { headers: { Authorization: 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64') } },
        )
      : Promise.resolve(null),
    // MiniMax AI — config-only check: their API doesn't expose a cheap
    // read endpoint (no /v1/models) and the only alternative is POSTing
    // a real chat completion which would cost money on every refresh.
    Promise.resolve(null),
    // Stripe — plain REST, no SDK import
    stripeKey
      ? fetchCheck('https://api.stripe.com/v1/balance', {
          headers: { Authorization: `Bearer ${stripeKey}` },
        })
      : Promise.resolve(null),
    // Resend
    resendKey
      ? fetchCheck('https://api.resend.com/domains', {
          headers: { Authorization: `Bearer ${resendKey}` },
        })
      : Promise.resolve(null),
  ]);

  const results: ApiCheckResult[] = [
    {
      name: 'Database (Supabase)',
      configured: true,
      status: dbResult.ok ? 'ok' : 'error',
      latencyMs: dbResult.latencyMs,
      error: dbResult.error,
    },
    {
      name: 'Twilio',
      configured: !!(twilioSid && twilioToken),
      status: twilioResult ? (twilioResult.ok ? 'ok' : 'error') : 'unconfigured',
      latencyMs: twilioResult?.latencyMs,
      error: twilioResult?.error,
      tenantsConnected: twilioCount,
    },
    {
      name: 'AI (Claude + MiniMax)',
      configured: !!(anthropicKey || minimaxKey),
      status: anthropicKey ? 'ok' : minimaxKey ? 'ok' : 'unconfigured',
    },
    {
      name: 'Stripe',
      configured: !!(stripeKey && process.env.STRIPE_WEBHOOK_SECRET),
      status: stripeResult ? (stripeResult.ok ? 'ok' : 'error') : 'unconfigured',
      latencyMs: stripeResult?.latencyMs,
      error: stripeResult?.error,
      tenantsConnected: stripeCount,
    },
    {
      name: 'Resend (Email)',
      configured: !!resendKey,
      status: resendResult ? (resendResult.ok ? 'ok' : 'error') : 'unconfigured',
      latencyMs: resendResult?.latencyMs,
      error: resendResult?.error,
    },
    {
      name: 'Clerk (Auth)',
      configured: !!(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
      status:
        process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
          ? 'ok'
          : 'unconfigured',
    },
    {
      name: 'Square POS',
      configured: !!(
        (process.env.SQUARE_APPLICATION_ID || process.env.SQUARE_APP_ID) &&
        (process.env.SQUARE_APPLICATION_SECRET || process.env.SQUARE_APP_SECRET)
      ),
      status:
        (process.env.SQUARE_APPLICATION_ID || process.env.SQUARE_APP_ID) &&
        (process.env.SQUARE_APPLICATION_SECRET || process.env.SQUARE_APP_SECRET)
          ? 'ok'
          : 'unconfigured',
      tenantsConnected: squareCount,
    },
    {
      name: 'Clover POS',
      configured: !!(process.env.CLOVER_APP_ID && process.env.CLOVER_APP_SECRET),
      status:
        process.env.CLOVER_APP_ID && process.env.CLOVER_APP_SECRET ? 'ok' : 'unconfigured',
      tenantsConnected: cloverCount,
    },
    {
      name: 'Toast POS',
      configured: !!process.env.TOAST_WEBHOOK_SECRET,
      status: process.env.TOAST_WEBHOOK_SECRET ? 'ok' : 'unconfigured',
      tenantsConnected: toastCount,
    },
    {
      name: 'Shopify',
      configured: !!(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET),
      status:
        process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET
          ? 'ok'
          : 'unconfigured',
      tenantsConnected: shopifyCount,
    },
  ];

  const checkedAt = new Date().toISOString();
  const allOk = results.every((r) => r.status === 'ok' || r.status === 'unconfigured');
  const errors = results.filter((r) => r.status === 'error').length;

  return apiSuccess({ results, checkedAt, allOk, errors });
}
