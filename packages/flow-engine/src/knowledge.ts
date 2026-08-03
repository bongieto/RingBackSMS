import { z } from 'zod';
import type { VerifiedKnowledgeFact } from './types';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'be', 'can', 'could', 'do', 'does', 'for',
  'from', 'have', 'how', 'i', 'in', 'is', 'it', 'me', 'of', 'on', 'or',
  'the', 'to', 'we', 'what', 'when', 'where', 'which', 'who', 'with', 'you',
  'your',
]);

const FACTUAL_PATTERNS = [
  /\b(hours?|open|close|closed|closing)\b/i,
  /\b(price|pricing|costs?|fees?|rates?|quotes?|estimates?|how much)\b/i,
  /\b(policy|policies|refund|return|cancel|cancellation|deposit)\b/i,
  /\b(deliver|delivery|pickup|ship|shipping|service area|travel)\b/i,
  /\b(address|located|location|directions|parking)\b/i,
  /\b(offer|provide|service|services|specialize|available|availability)\b/i,
  /\b(accept|payment|cash|card|insurance|medicare|medicaid)\b/i,
  /\b(allergy|allergies|gluten|vegan|vegetarian|ingredient)\b/i,
  /\b(website|phone|email|contact)\b/i,
];

const GroundedResponseSchema = z.object({
  answer: z.string().trim().min(1).max(320),
  supportedFactIds: z.array(z.string().min(1)).max(8),
  confidence: z.number().min(0).max(1),
  needsHuman: z.boolean(),
}).strict();

export type GroundedResponse = z.infer<typeof GroundedResponseSchema>;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s$:.@/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(' ')
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  );
}

export function isLikelyFactualQuestion(message: string): boolean {
  const trimmed = message.trim();
  return Boolean(trimmed) && FACTUAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function retrieveKnowledgeFacts(
  query: string,
  facts: VerifiedKnowledgeFact[],
  limit = 6,
): VerifiedKnowledgeFact[] {
  const queryNorm = normalize(query);
  const queryTokens = tokens(query);
  if (!queryNorm || queryTokens.size === 0) return [];

  return facts
    .map((fact) => {
      const searchable = [fact.key, fact.category, fact.question, ...fact.aliases].join(' ');
      const factNorm = normalize(searchable);
      const factTokens = tokens(searchable);
      let score = 0;

      for (const token of queryTokens) {
        if (factTokens.has(token)) score += 4;
        else if (factNorm.includes(token)) score += 2;
      }
      for (const alias of fact.aliases) {
        const normalizedAlias = normalize(alias);
        if (normalizedAlias && queryNorm.includes(normalizedAlias)) score += 8;
      }
      if (queryNorm.includes(normalize(fact.question))) score += 10;
      return { fact, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ fact }) => fact);
}

export function parseGroundedResponse(raw: string): GroundedResponse | null {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return GroundedResponseSchema.parse(JSON.parse(cleaned));
  } catch {
    return null;
  }
}

function extractNumbers(value: string): string[] {
  return normalize(value).match(/\b\d+(?:\.\d+)?\b/g) ?? [];
}

function extractEmails(value: string): string[] {
  return (value.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? [])
    .map((email) => email.toLowerCase());
}

function extractUrls(value: string): string[] {
  return (value.match(/\b(?:https?:\/\/|www\.)[^\s<>]+/gi) ?? [])
    .map((url) => url.toLowerCase().replace(/[),.;!?]+$/, ''));
}

const HIGH_RISK_CLAIMS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'free', pattern: /\bfree\b/i },
  { label: 'guaranteed', pattern: /\bguarantee(?:d|s)?\b/i },
  { label: 'licensed', pattern: /\blicen[cs]ed\b/i },
  { label: 'insured', pattern: /\binsured\b/i },
  { label: 'certified', pattern: /\bcertified\b/i },
  { label: 'warranty', pattern: /\bwarrant(?:y|ies)\b/i },
  { label: '24/7', pattern: /\b24\s*\/\s*7\b/i },
  { label: 'same-day', pattern: /\bsame[ -]?day\b/i },
  { label: 'after-hours', pattern: /\bafter[ -]?hours?\b/i },
  { label: 'emergency service', pattern: /\bemergency\s+services?\b/i },
  { label: 'financing', pattern: /\bfinanc(?:e|es|ing)\b/i },
  { label: 'refundable', pattern: /\b(?:non[- ]?)?refundable\b/i },
  { label: 'walk-ins', pattern: /\bwalk[- ]?ins?\b/i },
  { label: 'insurance acceptance', pattern: /\baccept(?:s|ed|ing)?\b.{0,24}\binsurance\b/i },
  { label: 'medicare acceptance', pattern: /\baccept(?:s|ed|ing)?\b.{0,24}\bmedicare\b/i },
  { label: 'medicaid acceptance', pattern: /\baccept(?:s|ed|ing)?\b.{0,24}\bmedicaid\b/i },
];

export function validateGroundedResponse(input: {
  response: GroundedResponse;
  retrievedFacts: VerifiedKnowledgeFact[];
  userMessage: string;
}): { valid: true } | { valid: false; reason: string } {
  const allowedIds = new Set(input.retrievedFacts.map((fact) => fact.id));
  if (input.response.supportedFactIds.length === 0) {
    return { valid: false, reason: 'no_supported_fact_ids' };
  }
  for (const id of input.response.supportedFactIds) {
    if (!allowedIds.has(id)) {
      return { valid: false, reason: `unknown_fact_id:${id}` };
    }
  }

  const supported = input.retrievedFacts.filter((fact) =>
    input.response.supportedFactIds.includes(fact.id),
  );
  // Only verified fact answers are evidence. Including the customer's message
  // here would let an unsupported number or claim be repeated back as though
  // the owner had verified it.
  const evidenceText = supported.map((fact) => fact.answer).join(' ');
  const evidenceNumbers = new Set(extractNumbers(evidenceText));
  for (const number of extractNumbers(input.response.answer)) {
    if (!evidenceNumbers.has(number)) {
      return { valid: false, reason: `unsupported_number:${number}` };
    }
  }

  const evidenceEmails = new Set(extractEmails(evidenceText));
  for (const email of extractEmails(input.response.answer)) {
    if (!evidenceEmails.has(email)) {
      return { valid: false, reason: `unsupported_email:${email}` };
    }
  }

  const evidenceUrls = new Set(extractUrls(evidenceText));
  for (const url of extractUrls(input.response.answer)) {
    if (!evidenceUrls.has(url)) {
      return { valid: false, reason: `unsupported_url:${url}` };
    }
  }

  for (const claim of HIGH_RISK_CLAIMS) {
    if (claim.pattern.test(input.response.answer) && !claim.pattern.test(evidenceText)) {
      return { valid: false, reason: `unsupported_claim:${claim.label}` };
    }
  }

  if (input.response.confidence < 0.65 && !input.response.needsHuman) {
    return { valid: false, reason: 'low_confidence_without_handoff' };
  }
  return { valid: true };
}

export function formatFactsForPrompt(facts: VerifiedKnowledgeFact[]): string {
  return facts.map((fact) => `[${fact.id}] ${fact.question}: ${fact.answer}`).join('\n');
}
