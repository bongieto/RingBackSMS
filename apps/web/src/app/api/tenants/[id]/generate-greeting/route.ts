import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';
import OpenAI from 'openai';

const AI_MODEL = 'MiniMax-M2.7';

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

async function fetchWebsiteContext(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'RingbackSMS/1.0 (Business Context Extractor)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    // Strip HTML tags, scripts, styles, and extract text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000); // limit context size
    return text || null;
  } catch (err) {
    logger.warn('Failed to fetch website for context', { url, error: (err as Error).message });
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.id },
      include: { config: true },
    });
    if (!tenant) return apiError('Tenant not found', 404);

    const config = tenant.config;
    const websiteUrl = config?.websiteUrl;

    // Fetch website context if URL is available
    let websiteContext = config?.websiteContext ?? null;
    if (websiteUrl && !websiteContext) {
      websiteContext = await fetchWebsiteContext(websiteUrl);
      // Save extracted context for future use
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

    const businessInfo = [
      `Business name: ${tenant.name}`,
      `Business type: ${tenant.businessType}`,
      config?.businessAddress ? `Address: ${config.businessAddress}` : null,
      config?.businessHoursStart && config?.businessHoursEnd
        ? `Business hours: ${config.businessHoursStart} - ${config.businessHoursEnd}`
        : null,
      config?.aiPersonality ? `Brand voice: ${config.aiPersonality}` : null,
      websiteContext ? `Website info: ${websiteContext.substring(0, 2000)}` : null,
    ].filter(Boolean).join('\n');

    const response = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Generate a friendly, professional missed-call SMS greeting for this business. The greeting should:
- Be 1-3 sentences (keep it concise for SMS)
- Apologize for the missed call
- Mention the business name
- Invite the customer to text back with their question or need
- Match the brand personality if provided
- Reference specific services/products if known from the website

Business info:
${businessInfo}

Return ONLY the greeting text, nothing else.`,
      }],
    });

    const greeting = stripThinkTags(response.choices[0]?.message?.content ?? '')
      || `Hi! Sorry we missed your call at ${tenant.name}. Text us back and we'll help you right away!`;

    logger.info('Greeting auto-generated', { tenantId: params.id });
    return apiSuccess({ greeting, websiteContext: websiteContext ? 'extracted' : 'none' });
  } catch (err: any) {
    logger.error('Failed to generate greeting', { error: err.message });
    return apiError(err.message, 500);
  }
}
