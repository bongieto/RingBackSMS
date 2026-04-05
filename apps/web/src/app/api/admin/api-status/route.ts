import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

function isSuperAdmin(userId: string | null): boolean {
  const adminId = process.env.SUPER_ADMIN_USER_ID?.trim();
  return !!userId && !!adminId && userId === adminId;
}

interface ApiCheckResult {
  name: string;
  configured: boolean;
  status: 'ok' | 'error' | 'unconfigured';
  latencyMs?: number;
  error?: string;
  tenantsConnected?: number;
}

async function checkWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs = 3000,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs)),
    ]);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

export async function GET(_request: NextRequest) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  // Run ALL checks in parallel to stay within Vercel's function timeout
  const [
    dbResult,
    twilioCount,
    stripeCount,
    squareCount,
    cloverCount,
    toastCount,
    shopifyCount,
    twilioCheck,
    anthropicCheck,
    stripeCheck,
    resendCheck,
  ] = await Promise.all([
    // DB ping
    checkWithTimeout(() => prisma.$queryRaw`SELECT 1`),
    // Tenant counts (fast DB queries)
    prisma.tenant.count({ where: { twilioSubAccountSid: { not: null } } }),
    prisma.tenant.count({ where: { stripeCustomerId: { not: null } } }),
    prisma.tenant.count({ where: { posProvider: 'square' } }),
    prisma.tenant.count({ where: { posProvider: 'clover' } }),
    prisma.tenant.count({ where: { posProvider: 'toast' } }),
    prisma.tenant.count({ where: { posProvider: 'shopify' } }),
    // Live API checks (only if configured)
    process.env.TWILIO_MASTER_ACCOUNT_SID && process.env.TWILIO_MASTER_AUTH_TOKEN
      ? checkWithTimeout(async () => {
          const twilio = await import('twilio');
          const client = twilio.default(
            process.env.TWILIO_MASTER_ACCOUNT_SID,
            process.env.TWILIO_MASTER_AUTH_TOKEN,
          );
          await client.api.accounts(process.env.TWILIO_MASTER_ACCOUNT_SID!).fetch();
        })
      : Promise.resolve(null),
    process.env.ANTHROPIC_API_KEY
      ? checkWithTimeout(async () => {
          const res = await fetch('https://api.anthropic.com/v1/models', {
            headers: {
              'x-api-key': process.env.ANTHROPIC_API_KEY!,
              'anthropic-version': '2023-06-01',
            },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        })
      : Promise.resolve(null),
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
      ? checkWithTimeout(async () => {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
          await stripe.balance.retrieve();
        })
      : Promise.resolve(null),
    process.env.RESEND_API_KEY
      ? checkWithTimeout(async () => {
          const res = await fetch('https://api.resend.com/domains', {
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      configured: !!(process.env.TWILIO_MASTER_ACCOUNT_SID && process.env.TWILIO_MASTER_AUTH_TOKEN),
      status: twilioCheck ? (twilioCheck.ok ? 'ok' : 'error') : 'unconfigured',
      latencyMs: twilioCheck?.latencyMs,
      error: twilioCheck?.error,
      tenantsConnected: twilioCount,
    },
    {
      name: 'Anthropic (Claude AI)',
      configured: !!process.env.ANTHROPIC_API_KEY,
      status: anthropicCheck ? (anthropicCheck.ok ? 'ok' : 'error') : 'unconfigured',
      latencyMs: anthropicCheck?.latencyMs,
      error: anthropicCheck?.error,
    },
    {
      name: 'Stripe',
      configured: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
      status: stripeCheck ? (stripeCheck.ok ? 'ok' : 'error') : 'unconfigured',
      latencyMs: stripeCheck?.latencyMs,
      error: stripeCheck?.error,
      tenantsConnected: stripeCount,
    },
    {
      name: 'Resend (Email)',
      configured: !!process.env.RESEND_API_KEY,
      status: resendCheck ? (resendCheck.ok ? 'ok' : 'error') : 'unconfigured',
      latencyMs: resendCheck?.latencyMs,
      error: resendCheck?.error,
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
      configured: !!(process.env.SQUARE_APPLICATION_ID && process.env.SQUARE_APPLICATION_SECRET),
      status:
        process.env.SQUARE_APPLICATION_ID && process.env.SQUARE_APPLICATION_SECRET
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
