import { TenantContext, ChatFn } from './types';
import { FlowType } from '@ringback/shared-types';

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

const ESCALATION_KEYWORDS = [
  'talk to a human',
  'talk to a person',
  'talk to someone',
  'speak to a human',
  'speak to a person',
  'speak to someone',
  'real person',
  'real human',
  'live agent',
  'live person',
  'representative',
  'operator',
  'agent',
  'stop bot',
  'stop ai',
  'human please',
  'get me a human',
  'i need a human',
  'i want a human',
  'let me talk to',
  'customer service',
  'manager',
  // Owner-by-role: "talk to the owner", "speak with the owner", "owner please"
  'talk to the owner',
  'speak to the owner',
  'speak with the owner',
  'owner please',
  'the owner',
];

/**
 * Match "talk to {firstWord}" or "speak to {firstWord}" where firstWord is
 * the tenant's name's first token (e.g. "Bruno's HVAC" → "bruno"). Catches
 * casual escalation like "talk to Bruno" without requiring the operator to
 * configure an explicit owner-name field.
 */
function matchesOwnerByName(message: string, tenantName: string | null | undefined): boolean {
  if (!tenantName) return false;
  // Strip "'s" possessive and trailing business words so "Bruno's HVAC Co."
  // → "Bruno". If the tenant name is generic ("Hvac Pros"), don't bother.
  const firstToken = tenantName
    .replace(/['\u2019]s\b/gi, '')
    .trim()
    .split(/\s+/)[0];
  if (!firstToken || firstToken.length < 3) return false;
  const generic = /^(the|a|an|my|our|hvac|pros|inc|llc|co|company|corp|services?|home|care)$/i;
  if (generic.test(firstToken)) return false;
  const escaped = firstToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$1');
  const re = new RegExp(`\\b(?:talk|speak|chat|connect)\\s+(?:to|with)\\s+${escaped}\\b`, 'i');
  return re.test(message);
}

export function detectEscalationIntent(
  message: string,
  tenantName?: string | null,
): boolean {
  const lower = message.toLowerCase().trim();
  if (ESCALATION_KEYWORDS.some((keyword) => lower.includes(keyword))) return true;
  if (matchesOwnerByName(message, tenantName)) return true;
  return false;
}

export interface IntentResult {
  intent: FlowType | 'UNCLEAR';
  confidence: number;
}

export async function detectIntent(
  message: string,
  tenantContext: TenantContext,
  chatFn: ChatFn,
): Promise<IntentResult> {
  const enabledFlowTypes = tenantContext.flows
    .filter((f) => f.isEnabled)
    .map((f) => f.type);

  // Fast keyword detection before calling AI
  const upperMsg = message.trim().toUpperCase();

  if (enabledFlowTypes.includes(FlowType.ORDER)) {
    if (
      upperMsg === 'ORDER' ||
      upperMsg === 'ORDERING' ||
      upperMsg === 'START ORDER' ||
      upperMsg.includes('ORDER FOOD') ||
      upperMsg.includes('PLACE ORDER') ||
      upperMsg.includes('START ORDER') ||
      upperMsg.includes('I WANT TO ORDER') ||
      upperMsg.includes('BUY') ||
      upperMsg.includes('MENU')
    ) {
      return { intent: FlowType.ORDER, confidence: 1.0 };
    }
    // Bare greeting as the opener. Previously these fell through to the
    // fallback LLM, whose prompt allowed it to emit `<silence>` — which
    // produced a dead "(no reply)" response to "hello". For a business
    // that sells food/goods, a bare-greeting opener is an invitation to
    // engage, not chit-chat noise. Route to ORDER so the customer gets
    // the warm "OK, what can I get you from {tenantName}?" greeting.
    //
    // Exception: when the business is closed, routing "hi" to ORDER
    // triggers orderAgent's hard closed-hours refusal — a brusque
    // "Sorry — we're closed right now" reply to a plain greeting.
    // Send closed-hours greetings to FALLBACK instead, where they
    // get a friendly acknowledgment + the prepended after-hours
    // notice from processInboundSms. Safe now that <silence> is
    // gone (commit d760c1e).
    if (
      /^(hi|hello|hey+|howdy|yo|hiya|hola|aloha|greetings|good\s+(morning|afternoon|evening|day))[\s!.,?]*$/i.test(
        message.trim(),
      )
    ) {
      if (tenantContext.hoursInfo?.openNow === false) {
        return { intent: FlowType.FALLBACK, confidence: 1.0 };
      }
      return { intent: FlowType.ORDER, confidence: 1.0 };
    }
  }

  if (enabledFlowTypes.includes(FlowType.INQUIRY)) {
    const lower = message.toLowerCase();
    if (
      /\b(do you have|got any|in stock|available|looking for|how much|price of|have any)\b/.test(lower)
    ) {
      return { intent: FlowType.INQUIRY, confidence: 0.9 };
    }
  }

  if (enabledFlowTypes.includes(FlowType.MEETING)) {
    if (
      upperMsg === 'MEETING' ||
      upperMsg.includes('SCHEDULE') ||
      upperMsg.includes('APPOINTMENT') ||
      upperMsg.includes('BOOK') ||
      upperMsg.includes('CALL')
    ) {
      return { intent: FlowType.MEETING, confidence: 1.0 };
    }
  }

  // Service-only tenants (MEETING + FALLBACK enabled, no ORDER/INQUIRY)
  // are agencies whose entire SMS surface is "schedule a consultation".
  // Common caregiver/legal/medical openers rarely contain the literal
  // word "appointment" — callers say "I need help with my dad", "looking
  // for a caregiver", "do you have anyone available". Without this
  // fast-path the LLM classifier sometimes routes them to FALLBACK and
  // the conversation never offers a booking. The trigger phrases below
  // are intentionally conservative — generic enough to catch real intent,
  // narrow enough to skip pure social messages ("hi", "thanks").
  const isServiceOnlyTenant =
    enabledFlowTypes.includes(FlowType.MEETING) &&
    !enabledFlowTypes.includes(FlowType.ORDER) &&
    !enabledFlowTypes.includes(FlowType.INQUIRY);

  if (isServiceOnlyTenant) {
    const lower = message.toLowerCase();
    // Pricing/info questions take priority over the meeting fast-path —
    // a customer asking "how much for an AC tune-up?" wants the price,
    // not to be dropped into the date picker. FALLBACK can answer using
    // the tenant's menu/services context. Without this gate, a question
    // like "how much for X" would hit the serviceNouns regex below and
    // jump straight to MEETING.
    const pricingQuestion =
      /\b(how\s+much|what\s+(?:does\s+it\s+cost|do\s+you\s+charge|is\s+the\s+(?:price|cost|rate))|what'?s\s+(?:the\s+)?(?:price|cost|rate|charge)|cost\s+(?:of|for)|price\s+(?:of|for)|do\s+you\s+(?:offer|have)\s+a?\s*(?:free\s+)?(?:estimate|quote))\b/;
    if (pricingQuestion.test(lower)) {
      return { intent: FlowType.FALLBACK, confidence: 0.9 };
    }
    const familyTerms =
      /\b(my\s+(mom|mother|dad|father|parent|parents|grandma|grandmother|grandpa|grandfather|husband|wife|spouse|partner|son|daughter|brother|sister))\b/;
    const serviceVerbs =
      /\b(hire|need|looking\s+for|interested\s+in|want\s+(?:to\s+(?:hire|get|find)|help|info))\b/;
    // Caregiver / consulting nouns
    const careNouns =
      /\b(caregiver|caretaker|nurse|aide|companion|in-home|in\s+home|home\s+care|home\s+health|hospice|consultation|consult|services?|estimate|quote)\b/;
    // Trade vocabulary — covers HVAC, plumbing, electrical, locksmith,
    // landscaping, roofing, pest control, cleaning, handyman. Caller
    // mentioning any of these is functionally a service request, so
    // route to MEETING and let the booking flow take over. Anchored on
    // word boundaries to avoid false positives ("electricity bill" etc.
    // are filtered by the prefix forms).
    const tradeNouns =
      /\b(hvac|a\.?c\.?|air\s*conditioner|air\s*conditioning|furnace|thermostat|duct(?:work)?|boiler|heat\s*pump|heater|condenser|plumb(?:er|ing)?|drain|faucet|pipe|leak(?:ing|y)?|clog(?:ged)?|water\s*heater|sewer|sump\s*pump|garbage\s*disposal|toilet|sink|shower|electric(?:al|ian)?|outlet|breaker|circuit|wiring|fuse|panel|generator|locksmith|deadbolt|rekey|lawn|landscap(?:e|ing|er)|mow(?:er|ing)?|sprinkler|irrigation|roof(?:er|ing)?|shingle|gutter|pest|exterminator|termite|roach|bedbug|handyman|contractor)\b/;
    // Damage/state vocabulary — caller describing a broken thing.
    const tradeStates =
      /\b(broken|busted|not\s*working|won'?t\s*(?:turn|work|start)|malfunction(?:ing)?|won'?t\s+(?:heat|cool)|no\s*(?:heat|hot\s*water|cold\s*water|power)|flood(?:ed|ing)?|burst)\b/;
    if (
      familyTerms.test(lower) ||
      serviceVerbs.test(lower) ||
      careNouns.test(lower) ||
      tradeNouns.test(lower) ||
      tradeStates.test(lower)
    ) {
      return { intent: FlowType.MEETING, confidence: 0.9 };
    }
  }

  // Use AI for ambiguous messages
  const flowDescriptions: Record<FlowType, string> = {
    [FlowType.ORDER]: 'placing a food or product order',
    [FlowType.MEETING]: 'scheduling a meeting, appointment, or call',
    [FlowType.INQUIRY]: 'asking about a product — availability, price, or if the shop carries it',
    [FlowType.CUSTOM]: 'a custom business workflow',
    [FlowType.FALLBACK]: 'general conversation or questions',
  };

  const availableFlows = enabledFlowTypes
    .map((ft) => `- ${ft}: ${flowDescriptions[ft]}`)
    .join('\n');

  const serviceOnlyHint = isServiceOnlyTenant
    ? `\n\nIMPORTANT context: ${tenantContext.tenantName} is a service business that schedules consultations/appointments via SMS. Any caller asking for help, services, or describing a need (even casually — "I need help with my mom", "do you have anyone available") is functionally a MEETING request. Choose FALLBACK only for purely social messages like greetings or closures.`
    : '';

  // When the tenant has a website-extracted blurb, give the LLM ~600
  // chars of it. Lets the classifier ground ambiguous messages in what
  // the business actually does — e.g. caller asks "do you do new
  // installs?" → website mentions "new system replacement consultation"
  // → high-confidence MEETING.
  const websiteSnippet = tenantContext.config.websiteContext
    ? tenantContext.config.websiteContext
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 600)
    : '';
  const websiteContextHint = websiteSnippet
    ? `\n\nFor reference, here is what ${tenantContext.tenantName} actually does (from their website):\n"${websiteSnippet}"`
    : '';

  const prompt = `The customer sent this SMS: "${message}"

Available flows:
${availableFlows}${serviceOnlyHint}${websiteContextHint}

Classify the customer's intent. Respond with JSON only:
{"intent": "<FLOW_TYPE or UNCLEAR>", "confidence": <0.0-1.0>}`;

  try {
    const raw = await chatFn({
      systemPrompt: `You are an intent classifier for ${tenantContext.tenantName}.`,
      userMessage: prompt,
      maxTokens: 100,
      temperature: 0.1,
    });

    const text = stripThinkTags(raw);
    const parsed = JSON.parse(text.trim()) as { intent: string; confidence: number };

    const intent =
      parsed.intent === 'UNCLEAR'
        ? 'UNCLEAR'
        : (parsed.intent as FlowType);

    return { intent, confidence: parsed.confidence };
  } catch {
    return { intent: 'UNCLEAR', confidence: 0 };
  }
}
