import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

function isSuperAdmin(userId: string | null): boolean {
  const adminId = process.env.SUPER_ADMIN_USER_ID?.trim();
  return !!userId && !!adminId && userId === adminId;
}

interface ApiCheckResult {
  name: string;
  configured: boolean;
  status: 'ok' | 'error' | 'unconfigured' | 'checking';
  latencyMs?: number;
  error?: string;
  tenantsConnected?: number;
}

async function checkWithTimeout<T>(fn: () => Promise<T>, timeoutMs = 5000): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
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

  const results: ApiCheckResult[] = [];

  // 1. Database (Prisma/Supabase)
  {
    const check = await checkWithTimeout(() => prisma.$queryRaw`SELECT 1`);
    results.push({
      name: 'Database (Supabase)',
      configured: true,
      status: check.ok ? 'ok' : 'error',
      latencyMs: check.latencyMs,
      error: check.error,
    });
  }

  // 2. Twilio
  {
    const configured = !!(process.env.TWILIO_MASTER_ACCOUNT_SID && process.env.TWILIO_MASTER_AUTH_TOKEN);
    let status: ApiCheckResult['status'] = configured ? 'ok' : 'unconfigured';
    let latencyMs: number | undefined;
    let error: string | undefined;
    if (configured) {
      const check = await checkWithTimeout(async () => {
        const twilio = await import('twilio');
        const client = twilio.default(process.env.TWILIO_MASTER_ACCOUNT_SID, process.env.TWILIO_MASTER_AUTH_TOKEN);
        await client.api.accounts(process.env.TWILIO_MASTER_ACCOUNT_SID!).fetch();
      });
      status = check.ok ? 'ok' : 'error';
      latencyMs = check.latencyMs;
      error = check.error;
    }
    const tenantsConnected = await prisma.tenant.count({ where: { twilioSubAccountSid: { not: null } } });
    results.push({ name: 'Twilio', configured, status, latencyMs, error, tenantsConnected });
  }

  // 3. Anthropic (Claude AI)
  {
    const configured = !!process.env.ANTHROPIC_API_KEY;
    let status: ApiCheckResult['status'] = configured ? 'ok' : 'unconfigured';
    let latencyMs: number | undefined;
    let error: string | undefined;
    if (configured) {
      const check = await checkWithTimeout(async () => {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
      status = check.ok ? 'ok' : 'error';
      latencyMs = check.latencyMs;
      error = check.error;
    }
    results.push({ name: 'Anthropic (Claude AI)', configured, status, latencyMs, error });
  }

  // 4. Stripe
  {
    const configured = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
    let status: ApiCheckResult['status'] = configured ? 'ok' : 'unconfigured';
    let latencyMs: number | undefined;
    let error: string | undefined;
    if (configured) {
      const check = await checkWithTimeout(async () => {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
        await stripe.balance.retrieve();
      });
      status = check.ok ? 'ok' : 'error';
      latencyMs = check.latencyMs;
      error = check.error;
    }
    const tenantsConnected = await prisma.tenant.count({ where: { stripeCustomerId: { not: null } } });
    results.push({ name: 'Stripe', configured, status, latencyMs, error, tenantsConnected });
  }

  // 5. Square POS
  {
    const configured = !!(process.env.SQUARE_APPLICATION_ID && process.env.SQUARE_APPLICATION_SECRET);
    const tenantsConnected = await prisma.tenant.count({ where: { posProvider: 'square' } });
    results.push({ name: 'Square POS', configured, status: configured ? 'ok' : 'unconfigured', tenantsConnected });
  }

  // 6. Clover POS
  {
    const configured = !!(process.env.CLOVER_APP_ID && process.env.CLOVER_APP_SECRET);
    const tenantsConnected = await prisma.tenant.count({ where: { posProvider: 'clover' } });
    results.push({ name: 'Clover POS', configured, status: configured ? 'ok' : 'unconfigured', tenantsConnected });
  }

  // 7. Toast POS
  {
    const configured = !!process.env.TOAST_WEBHOOK_SECRET;
    const tenantsConnected = await prisma.tenant.count({ where: { posProvider: 'toast' } });
    results.push({ name: 'Toast POS', configured, status: configured ? 'ok' : 'unconfigured', tenantsConnected });
  }

  // 8. Shopify POS
  {
    const configured = !!(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
    const tenantsConnected = await prisma.tenant.count({ where: { posProvider: 'shopify' } });
    results.push({ name: 'Shopify', configured, status: configured ? 'ok' : 'unconfigured', tenantsConnected });
  }

  // 9. Resend (email)
  {
    const configured = !!process.env.RESEND_API_KEY;
    let status: ApiCheckResult['status'] = configured ? 'ok' : 'unconfigured';
    let latencyMs: number | undefined;
    let error: string | undefined;
    if (configured) {
      const check = await checkWithTimeout(async () => {
        const res = await fetch('https://api.resend.com/domains', {
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
      status = check.ok ? 'ok' : 'error';
      latencyMs = check.latencyMs;
      error = check.error;
    }
    results.push({ name: 'Resend (Email)', configured, status, latencyMs, error });
  }

  // 10. Clerk Auth
  {
    const configured = !!(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
    results.push({ name: 'Clerk (Auth)', configured, status: configured ? 'ok' : 'unconfigured' });
  }

  const checkedAt = new Date().toISOString();
  const allOk = results.every((r) => r.status === 'ok' || r.status === 'unconfigured');
  const errors = results.filter((r) => r.status === 'error').length;

  return apiSuccess({ results, checkedAt, allOk, errors });
}
