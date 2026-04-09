import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';
import { checkRateLimit, rateLimitResponse } from '@/lib/server/rateLimit';
import OpenAI from 'openai';

const AI_MODEL = 'MiniMax-M2.7';

type SlotKey =
  | 'greeting'
  | 'greetingAfterHours'
  | 'greetingRapidRedial'
  | 'greetingReturning'
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
    key: 'greeting',
    channel: 'sms',
    tier: 'default',
    maxChars: 140,
    intent:
      'First-touch SMS sent right after a missed call. Friendly intro, mention business name, invite the caller to text back what they need. Include a clear next-step call to action.',
  },
  {
    key: 'greetingAfterHours',
    channel: 'sms',
    tier: 'afterHours',
    maxChars: 140,
    intent:
      'Sent when the call comes in outside business hours. Acknowledge we are closed, set a clear next-day expectation, invite them to text their request so we can respond first thing.',
  },
  {
    key: 'greetingRapidRedial',
    channel: 'sms',
    tier: 'rapidRedial',
    maxChars: 100,
    intent:
      'Sent when the same caller rings 2+ times within 5 minutes. Urgent, reassuring acknowledgment that we see them and the owner has been alerted. Do NOT repeat the standard greeting.',
  },
  {
    key: 'greetingReturning',
    channel: 'sms',
    tier: 'returning',
    maxChars: 140,
    intent:
      'Sent when the caller has a prior order or is marked Customer/VIP. Warm welcome-back tone, hint at the option to reorder or pick up where they left off.',
  },
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

async function fetchWebsiteContext(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'RingbackSMS/1.0 (Business Context Extractor)' },
      signal: AbortSignal.timeout(10000),
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

  // Bulk endpoint = 8 model calls per request. Limit 5/hour per tenant.
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

    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) return apiError('AI service not configured', 500);

    const client = new OpenAI({
      baseURL: 'https://api.minimax.io/v1',
      apiKey,
    });

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
        const response = await client.chat.completions.create({
          model: AI_MODEL,
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        });
        const raw = response.choices[0]?.message?.content ?? '';
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
