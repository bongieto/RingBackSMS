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
  /\b(price|pricing|cost|fee|rate|quote|estimate|how much)\b/i,
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
  const evidenceText = `${supported.map((fact) => fact.answer).join(' ')} ${input.userMessage}`;
  const evidenceNumbers = new Set(extractNumbers(evidenceText));
  for (const number of extractNumbers(input.response.answer)) {
    if (!evidenceNumbers.has(number)) {
      return { valid: false, reason: `unsupported_number:${number}` };
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
