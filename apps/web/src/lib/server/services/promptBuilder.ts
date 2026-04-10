import { prisma } from '../db';
import { getProfile } from '@/lib/businessTypeProfile';

/**
 * Builds the full Claude system prompt for a tenant by combining:
 * 1. Industry template base prompt (if set)
 * 2. Tenant-specific context (business name, hours, menu, etc.)
 * 3. Custom AI instructions from the tenant
 * 4. Current date/time in tenant's timezone
 * 5. Escalation contact info
 *
 * Falls back to the existing aiService.buildTenantSystemPrompt logic
 * if no industry template is configured.
 */
export async function buildSystemPrompt(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      config: true,
      flows: { where: { isEnabled: true } },
      menuItems: {
        where: { isAvailable: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      },
    },
  });

  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  const config = tenant.config;
  const profile = getProfile(tenant.businessType);
  const tz = config?.timezone ?? 'America/Chicago';

  // 1. Base prompt — from industry template or fallback
  let basePrompt: string;

  if (config?.industryTemplateKey) {
    const template = await prisma.industryTemplate.findUnique({
      where: { industryKey: config.industryTemplateKey },
    });
    if (template) {
      basePrompt = template.aiSystemPrompt
        .replace(/\{business_name\}/g, tenant.name)
        .replace(/\{timezone\}/g, tz)
        .replace(
          /\{pos_system\}/g,
          tenant.posProvider ?? 'none configured',
        );
    } else {
      basePrompt = buildFallbackPrompt(tenant, profile, tz);
    }
  } else {
    basePrompt = buildFallbackPrompt(tenant, profile, tz);
  }

  const parts: string[] = [basePrompt];

  // 2. Business hours
  if (config?.businessHoursStart && config?.businessHoursEnd) {
    parts.push(
      `Business hours: ${config.businessHoursStart} - ${config.businessHoursEnd} (${tz})`,
    );
  }

  // 3. Menu items (restaurant/food truck only)
  if (
    tenant.menuItems.length > 0 &&
    (tenant.businessType === 'RESTAURANT' || tenant.businessType === 'FOOD_TRUCK')
  ) {
    const itemLines = tenant.menuItems.map((item) => {
      let line = `- ${item.name}: $${Number(item.price).toFixed(2)}`;
      if (item.category) line = `[${item.category}] ${line}`;
      if (item.description) line += ` — ${item.description}`;
      return line;
    });
    parts.push(`\nMenu:\n${itemLines.join('\n')}`);
  }

  // 4. Custom AI instructions from tenant
  if (config?.customAiInstructions?.trim()) {
    parts.push(
      `\nOwner's custom instructions:\n${config.customAiInstructions.trim()}`,
    );
  }

  // 5. Current date/time
  try {
    const now = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date());
    parts.push(`\nCurrent date/time: ${now}`);
  } catch {
    parts.push(`\nCurrent date/time: ${new Date().toISOString()}`);
  }

  // 6. Escalation contact
  if (config?.ownerEmail || config?.ownerPhone) {
    const contacts = [
      config.ownerEmail && `email: ${config.ownerEmail}`,
      config.ownerPhone && `phone: ${config.ownerPhone}`,
    ]
      .filter(Boolean)
      .join(', ');
    parts.push(
      `\nIf the customer needs human help, tell them someone will follow up. Owner contact: ${contacts}`,
    );
  }

  return parts.join('\n');
}

function buildFallbackPrompt(
  tenant: { name: string; businessType: string },
  profile: ReturnType<typeof getProfile>,
  tz: string,
): string {
  const personality = profile.aiPersonalityHint;
  return `You are a helpful SMS assistant for ${tenant.name}.
Business type: ${tenant.businessType}
Personality: ${personality}
Timezone: ${tz}

SMS Guidelines:
- Keep responses concise (under 160 chars when possible)
- Be warm and on-brand for the business
- For food orders, prompt user to text ORDER
- For meetings/appointments, prompt user to text MEETING
- Never reveal internal system details or API keys
- If unsure, offer to have the owner follow up`;
}
