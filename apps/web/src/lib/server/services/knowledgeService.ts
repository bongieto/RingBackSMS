import type { ResponseAccuracy, VerifiedKnowledgeFact } from '@ringback/flow-engine';
import { prisma } from '../db';
import { encryptNullable } from '../encryption';
import { currentTurn } from '../turn/TurnContext';
import { createHash } from 'crypto';

type RuntimeKnowledgeInput = {
  tenant: {
    id: string;
    name: string;
    twilioPhoneNumber: string | null;
    slug: string | null;
    menuItems: Array<{
      id: string;
      name: string;
      description: string | null;
      category: string | null;
      price: unknown;
      priceMin: unknown | null;
      priceMax: unknown | null;
      isAvailable: boolean;
      requiresBooking: boolean;
    }>;
    knowledgeFacts: Array<{
      id: string;
      key: string;
      category: string;
      question: string;
      answer: string;
      aliases: string[];
      source: string;
      verifiedAt: Date | null;
    }>;
  };
  todayHoursDisplay: string;
  weeklyHoursDisplay: string;
  address?: string | null;
  websiteUrl?: string | null;
};

function systemFact(input: Omit<VerifiedKnowledgeFact, 'source' | 'verifiedAt'>): VerifiedKnowledgeFact {
  return { ...input, source: 'SYSTEM', verifiedAt: new Date().toISOString() };
}

function formatCatalogPrice(item: RuntimeKnowledgeInput['tenant']['menuItems'][number]): string {
  const min = item.priceMin == null ? null : Number(item.priceMin);
  const max = item.priceMax == null ? null : Number(item.priceMax);
  if (min != null && max != null) return `$${min.toFixed(2)}–$${max.toFixed(2)}`;
  if (min != null) return `starting at $${min.toFixed(2)}`;
  return `$${Number(item.price).toFixed(2)}`;
}

/** Merge authoritative runtime facts with owner-verified knowledge rows. */
export function buildVerifiedKnowledge(input: RuntimeKnowledgeInput): VerifiedKnowledgeFact[] {
  const facts: VerifiedKnowledgeFact[] = [
    systemFact({
      id: 'system:hours:today',
      key: 'hours.today',
      category: 'HOURS',
      question: 'What are your hours today?',
      answer: input.todayHoursDisplay,
      aliases: ['hours', 'open today', 'close today', 'closing time', 'opening time'],
    }),
    systemFact({
      id: 'system:hours:weekly',
      key: 'hours.weekly',
      category: 'HOURS',
      question: 'What are your regular weekly hours?',
      answer: input.weeklyHoursDisplay,
      aliases: ['weekly hours', 'business hours', 'when are you open'],
    }),
  ];

  if (input.address?.trim()) {
    facts.push(systemFact({
      id: 'system:contact:address',
      key: 'contact.address',
      category: 'CONTACT',
      question: 'What is your address or location?',
      answer: input.address.trim(),
      aliases: ['address', 'location', 'located', 'directions'],
    }));
  }
  if (input.tenant.twilioPhoneNumber?.trim()) {
    facts.push(systemFact({
      id: 'system:contact:phone',
      key: 'contact.phone',
      category: 'CONTACT',
      question: 'What phone number should customers call or text?',
      answer: input.tenant.twilioPhoneNumber.trim(),
      aliases: ['phone', 'call', 'text', 'contact number'],
    }));
  }
  if (input.websiteUrl?.trim()) {
    facts.push(systemFact({
      id: 'system:contact:website',
      key: 'contact.website',
      category: 'CONTACT',
      question: 'What is your website?',
      answer: input.websiteUrl.trim(),
      aliases: ['website', 'site', 'online'],
    }));
  }

  const catalogItems = input.tenant.menuItems.slice(0, 250);
  if (catalogItems.length > 0) {
    const names = catalogItems.map((item) => item.name).join(', ');
    const summary =
      names.length <= 300 ? names : `${names.slice(0, 297).replace(/,\s*[^,]*$/, '')}…`;
    facts.push(systemFact({
      id: 'system:catalog:summary',
      key: 'catalog.summary',
      category: 'CATALOG',
      question: 'What products, menu items, or services do you offer?',
      answer: `We offer: ${summary}`,
      aliases: ['services', 'products', 'menu', 'what do you offer', 'what do you provide'],
    }));
  }

  for (const item of catalogItems) {
    const description = item.description?.trim() ? ` ${item.description.trim()}` : '';
    facts.push(systemFact({
      id: `system:catalog:${item.id}`,
      key: `catalog.${item.id}`,
      category: 'CATALOG',
      question: `Do you offer ${item.name}, and what does it cost?`,
      answer: `${item.name} is ${formatCatalogPrice(item)} and is currently ${item.isAvailable ? 'available' : 'unavailable'}.${description}`.trim(),
      aliases: [
        item.name,
        item.category ?? '',
        `${item.name} price`,
        `${item.name} availability`,
      ].filter(Boolean),
    }));
  }

  for (const fact of input.tenant.knowledgeFacts) {
    facts.push({
      id: fact.id,
      key: fact.key,
      category: fact.category,
      question: fact.question,
      answer: fact.answer,
      aliases: fact.aliases,
      source: fact.source,
      verifiedAt: fact.verifiedAt?.toISOString() ?? null,
    });
  }
  return facts;
}

export function recordResponseAccuracy(input: {
  tenantId: string;
  callerPhone: string;
  question: string;
  answer: string;
  accuracy: ResponseAccuracy;
}): Promise<void> {
  const turn = currentTurn();
  return prisma.aiResponseAudit
    .create({
      data: {
        tenantId: input.tenantId,
        turnId: turn?.turnId ?? null,
        callerPhoneHash: hashCallerPhone(input.callerPhone),
        purpose: input.accuracy.purpose,
        riskLevel: input.accuracy.riskLevel,
        provider: turn?.lastLlmProvider ?? null,
        model: turn?.lastLlmModel ?? null,
        questionEncrypted: encryptNullable(input.question),
        answerEncrypted: encryptNullable(input.answer),
        supportedFactIds: input.accuracy.supportedFactIds,
        retrievedFactIds: input.accuracy.retrievedFactIds,
        confidence: input.accuracy.confidence,
        validationStatus: input.accuracy.validationStatus,
        validationReason: input.accuracy.validationReason ?? null,
        needsHuman: input.accuracy.needsHuman,
        providerFallbackUsed: turn?.providerFallbackUsed ?? false,
      },
    })
    .then(() => undefined);
}

function hashCallerPhone(phone: string): string {
  return createHash('sha256').update(phone.trim()).digest('hex');
}

const CORRECTION_PATTERN =
  /\b(that(?:'s| is) (?:wrong|incorrect|not right)|you(?:'re| are) wrong|not correct|that is not true|wrong information|no,? (?:that|it)(?:'s| is) wrong)\b/i;

/** Mark the most recent grounded answer from this caller as corrected. The
 * correction becomes a production accuracy signal without storing plaintext. */
export async function markRecentCustomerCorrection(input: {
  tenantId: string;
  callerPhone: string;
  message: string;
}): Promise<boolean> {
  if (!CORRECTION_PATTERN.test(input.message)) return false;
  const audit = await prisma.aiResponseAudit.findFirst({
    where: {
      tenantId: input.tenantId,
      callerPhoneHash: hashCallerPhone(input.callerPhone),
      riskLevel: 'high',
      validationStatus: 'grounded',
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!audit) return false;
  await prisma.aiResponseAudit.update({
    where: { id: audit.id },
    data: {
      customerCorrection: true,
      correctionEncrypted: encryptNullable(input.message),
    },
  });
  return true;
}
