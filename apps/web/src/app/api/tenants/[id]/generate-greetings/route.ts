import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';
import { checkRateLimit, rateLimitResponse } from '@/lib/server/rateLimit';
import { chatCompletion } from '@/lib/server/services/aiClient';

type SlotKey =
  | 'voiceGreeting'
  | 'voiceGreetingAfterHours'
  | 'voiceGreetingRapidRedial'
  | 'voiceGreetingReturning';

interface SlotSpec {
  key: SlotKey;
  channel: 'sms' | 'voice';
  tier: 'default' | 'afterHours' | 'rapidRedial' | 'returning';
  maxChars: number;
  intent: string;
}

const SLOTS: SlotSpec[] = [
  {
    key: 'voiceGreeting',
    channel: 'voice',
    tier: 'default',
    maxChars: 200,
    intent:
      'Spoken via TTS when a caller reaches the line. Natural conversational tone, ≤20 words. Tell them we will text them in a moment and they can also leave a voicemail.',
  },
  {
    key: 'voiceGreetingAfterHours',
    channel: 'voice',
    tier: 'afterHours',
    maxChars: 200,
    intent:
      'Spoken when calls arrive outside business hours, ≤20 words. Acknowledge closed, invite voicemail, mention we will text them back when we open.',
  },
  {
    key: 'voiceGreetingRapidRedial',
    channel: 'voice',
    tier: 'rapidRedial',
    maxChars: 80,
    intent:
      'Spoken on a rapid redial. MUST be ≤8 words. Reassure them we see them and to check their texts.',
  },
  {
    key: 'voiceGreetingReturning',
    channel: 'voice',
    tier: 'returning',
    maxChars: 200,
    intent:
      'Spoken when a known returning customer calls, ≤20 words. Warm welcome-back, tell them we just texted them.',
  },
];

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

function cleanGreeting(text: string, maxChars: number): string {
  let cleaned = stripThinkTags(text);
  // Strip surrounding quotes
  cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '').trim();
  // Drop leading "Greeting:" / "SMS:" prefixes the model sometimes adds
  cleaned = cleaned.replace(/^(greeting|sms|voice|message)\s*:\s*/i, '').trim();
  if (cleaned.length > maxChars) {
    // Hard truncate at last sentence boundary if possible
    const truncated = cleaned.slice(0, maxChars);
    const lastPunct = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );
    cleaned = lastPunct > maxChars * 0.6 ? truncated.slice(0, lastPunct + 1) : truncated.trim();
  }
  return cleaned;
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow HTTPS
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    // Block internal/reserved IPs and hostnames
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^0\./.test(hostname) ||
      hostname === '[::1]' ||
      hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80')
    ) return false;
    // Block cloud metadata endpoints
    if (hostname === 'metadata.google.internal') return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchWebsiteContext(url: string): Promise<string | null> {
  if (!isSafeUrl(url)) {
    logger.warn('SSRF blocked: unsafe URL', { url });
    return null;
  }
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'RingbackSMS/1.0 (Business Context Extractor)' },
      signal: AbortSignal.timeout(10000),
      redirect: 'error', // Don't follow redirects to internal URLs
    });
    if (!response.ok) return null;
    const html = await response.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000);
    return text || null;
  } catch (err) {
    logger.warn('Failed to fetch website for context', { url, error: (err as Error).message });
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;

  // Bulk endpoint = 4 model calls per request. Limit 5/hour per tenant.
  const rl = await checkRateLimit(`gen-greetings-bulk:${params.id}`, 5, 3600);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      include: { config: true },
    });
    if (!tenant) return apiError('Tenant not found', 404);

    const config = tenant.config;
    const websiteUrl = config?.websiteUrl;

    let websiteContext = config?.websiteContext ?? null;
    if (websiteUrl && !websiteContext) {
      websiteContext = await fetchWebsiteContext(websiteUrl);
      if (websiteContext && config) {
        await prisma.tenantConfig.update({
          where: { tenantId: params.id },
          data: { websiteContext },
        });
      }
    }

    const brandBrief = [
      `Business name: ${tenant.name}`,
      `Business type: ${tenant.businessType}`,
      config?.businessAddress ? `Address: ${config.businessAddress}` : null,
      config?.businessHoursStart && config?.businessHoursEnd
        ? `Business hours: ${config.businessHoursStart} - ${config.businessHoursEnd}`
        : null,
      config?.aiPersonality ? `Brand voice: ${config.aiPersonality}` : null,
      websiteContext ? `Website info: ${websiteContext.substring(0, 2000)}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const generateOne = async (slot: SlotSpec): Promise<[SlotKey, string]> => {
      const prompt = `You are writing a single ${slot.channel === 'sms' ? 'SMS message' : 'voice greeting (spoken aloud via TTS)'} for a business.

HARD CONSTRAINTS:
- MUST be ${slot.maxChars} characters or fewer.
${slot.channel === 'voice' ? '- Natural spoken cadence, no emojis, no URLs.\n' : '- No emojis. No URLs. No "Reply STOP" boilerplate (carrier adds it).\n'}- Output ONLY the message text. No quotes, no labels, no explanation.

INTENT: ${slot.intent}

BRAND BRIEF:
${brandBrief}`;

      try {
        const raw = await chatCompletion({
          systemPrompt: 'You are a professional copywriter writing short business greetings.',
          userMessage: prompt,
          maxTokens: 200,
        });
        return [slot.key, cleanGreeting(raw, slot.maxChars)];
      } catch (err) {
        logger.warn('Slot generation failed', {
          tenantId: params.id,
          slot: slot.key,
          error: (err as Error).message,
        });
        return [slot.key, ''];
      }
    };

    const results = await Promise.all(SLOTS.map(generateOne));
    const generated = Object.fromEntries(results) as Record<SlotKey, string>;
    const filled = Object.values(generated).filter((v) => v && v.length > 0);

    logger.info('Bulk greetings generated', {
      tenantId: params.id,
      filled: filled.length,
      total: SLOTS.length,
      empty: Object.entries(generated)
        .filter(([, v]) => !v)
        .map(([k]) => k),
    });

    if (filled.length === 0) {
      // Every slot came back empty — MiniMax is down, rate-limited, or
      // the key is bad. Fail loudly instead of pretending we succeeded.
      return apiError('AI failed to generate any greetings — check logs', 502);
    }

    return apiSuccess({
      generated,
      filled: filled.length,
      total: SLOTS.length,
      websiteContext: websiteContext ? 'extracted' : 'none',
    });
  } catch (err: any) {
    logger.error('Failed to bulk-generate greetings', { error: err.message });
    return apiError(err.message, 500);
  }
}
