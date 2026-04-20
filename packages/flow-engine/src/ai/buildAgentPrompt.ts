import type { MenuItem, OrderDraft } from '@ringback/shared-types';
import type { TenantContext, CallerMemory } from '../types';
import { formatCart } from './orderAgentTools';
import { languageLabel } from './languageDetect';

function formatMenu(menu: MenuItem[]): string {
  if (menu.length === 0) return '(no menu items available)';
  return menu
    .map((m) => {
      const price = `$${m.price.toFixed(2)}`;
      const desc = m.description ? ` — ${m.description}` : '';
      const cat = m.category ? ` (${m.category})` : '';
      const mods =
        m.modifierGroups && m.modifierGroups.length > 0
          ? ` | modifiers: ${m.modifierGroups
              .map(
                (g) =>
                  `${g.name}${g.required ? '*' : ''}: ${g.modifiers
                    .map((mod) => mod.name)
                    .join('/')}`,
              )
              .join('; ')}`
          : '';
      return `- [${m.id}] ${m.name}${cat} — ${price}${desc}${mods}`;
    })
    .join('\n');
}

function formatMemory(memory?: CallerMemory): string {
  if (!memory) return '(no prior history)';
  const bits: string[] = [];
  if (memory.contactName) bits.push(`Name: ${memory.contactName}`);
  if (memory.contactStatus) bits.push(`Tier: ${memory.contactStatus}`);
  if (memory.lastOrderSummary) bits.push(`Last order: ${memory.lastOrderSummary}`);
  if (memory.lastOrderItems?.length) {
    bits.push(
      `Last order items: ${memory.lastOrderItems
        .map((i) => `${i.quantity}× ${i.name}`)
        .join(', ')}`,
    );
  }
  return bits.length ? bits.join('\n') : '(no prior history)';
}

export interface BuildAgentPromptArgs {
  tenantContext: TenantContext;
  filteredMenu: MenuItem[];
  /** Items that EXIST on this tenant's menu but are 86'd/unavailable
   *  today. Included in the prompt as a separate section so the agent
   *  can distinguish "we're out today" from "we don't carry that". */
  soldOutItems?: MenuItem[];
  draft: OrderDraft | null;
  memory?: CallerMemory;
  pendingClarification?: { field: string; question: string } | null;
  /** Raw inbound customer message, used for deterministic item-name
   *  hinting. When the customer's text contains a menu-item name as a
   *  contiguous phrase (e.g. "lumpia prito" → "Lumpia Prito"), we inject
   *  a high-priority hint block pinning the LLM to the correct id.
   *  Solves cross-language resolution drift: multilingual phrasing was
   *  biasing the LLM to pick the first-word-match ("Lumpia Regular")
   *  over the exact-phrase match ("Lumpia Prito"). */
  inboundMessage?: string;
}

/** Normalize a string for substring comparison:
 *  - lowercase
 *  - strip parens-descriptor tails ("Lumpia Prito (Fried Lumpia)" → "lumpia prito")
 *  - collapse whitespace and punctuation to single spaces */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Scan the inbound message for exact menu-item-name phrase matches.
 *  Returns a list of (phrase, item) pairs, preferring longer/more-specific
 *  names when multiple items match the same region (so "Lumpia Prito"
 *  wins over "Lumpia" alone). Plural "s" tolerated. */
export function findItemPhraseMatches(
  inbound: string,
  menu: MenuItem[],
): Array<{ phrase: string; item: MenuItem }> {
  // Normalize inbound the same way AND generate a "-ng suffix dropped"
  // variant so Tagalog ligature phrasing ("lumpiang prito") matches the
  // menu name ("Lumpia Prito"). We search both spellings.
  const normInboundBase = normalizeForMatch(inbound);
  const normInboundNoNg = normInboundBase.replace(/(\w)ng\b/g, '$1');
  const searchSpaces = [` ${normInboundBase} `];
  if (normInboundNoNg !== normInboundBase) searchSpaces.push(` ${normInboundNoNg} `);
  const normInbound = searchSpaces[0];
  if (normInbound.trim().length === 0) return [];
  // Consider name variants to match the customer's casual phrasing.
  // "Lumpiang Prito" (with Tagalog ligature) should match "Lumpia Prito".
  const candidates = menu
    .map((item) => {
      const base = normalizeForMatch(item.name);
      if (!base) return null;
      // Generate variants: base, base without "ng " before each word, and
      // with/without trailing 's'. Small set — cheap.
      const variants = new Set<string>([base]);
      // "lumpiang prito" ↔ "lumpia prito": strip "ng" suffix from any word
      const dropNg = base.replace(/(\w)ng\b/g, '$1');
      if (dropNg !== base) variants.add(dropNg);
      return { item, variants: Array.from(variants).filter((v) => v.length >= 3) };
    })
    .filter((x): x is { item: MenuItem; variants: string[] } => x !== null);

  // Sort by longest variant first so more-specific names match before
  // their prefixes ("lumpia prito" before "lumpia").
  candidates.sort((a, b) => {
    const la = Math.max(...a.variants.map((v) => v.length));
    const lb = Math.max(...b.variants.map((v) => v.length));
    return lb - la;
  });

  const matched: Array<{ phrase: string; item: MenuItem }> = [];
  const seenIds = new Set<string>();
  // Build a mutable copy of the message; as we match a region, blank it
  // out so a shorter prefix (Lumpia Regular) doesn't also claim the
  // same span that Lumpia Prito already owns.
  // Search each spelling of the inbound in parallel; when any variant
  // matches, record the hit and blank the region in ALL spellings so a
  // less-specific name can't re-claim the same span.
  const remainings = searchSpaces.slice();
  for (const cand of candidates) {
    if (seenIds.has(cand.item.id)) continue;
    outer: for (const variant of cand.variants) {
      const needle = ` ${variant} `;
      const needlePlural = ` ${variant}s `;
      for (let i = 0; i < remainings.length; i++) {
        let idx = remainings[i].indexOf(needle);
        let hit = needle;
        if (idx === -1) {
          idx = remainings[i].indexOf(needlePlural);
          hit = needlePlural;
        }
        if (idx !== -1) {
          matched.push({ phrase: variant, item: cand.item });
          seenIds.add(cand.item.id);
          for (let j = 0; j < remainings.length; j++) {
            const r = remainings[j];
            const jdx = r.indexOf(hit);
            if (jdx !== -1) {
              remainings[j] = r.slice(0, jdx + 1) + ' '.repeat(hit.length - 2) + r.slice(jdx + hit.length - 1);
            }
          }
          break outer;
        }
      }
    }
  }
  void normInbound;
  return matched;
}

function formatItemHints(
  inbound: string | undefined,
  menu: MenuItem[],
): string {
  if (!inbound) return '';
  const hits = findItemPhraseMatches(inbound, menu);
  if (hits.length === 0) return '';
  const lines = hits
    .map((h) => `- Customer phrase "${h.phrase}" → use menu_item_id "${h.item.id}" (${h.item.name}, $${h.item.price.toFixed(2)})`)
    .join('\n');
  return `\n# Item resolution hints (DETERMINISTIC — follow exactly)\nThese phrase→id bindings were computed by exact-phrase match against the menu. They override any guess you might make from partial-word matching. Use these menu_item_id values verbatim:\n${lines}\n`;
}

function formatSoldOut(items: MenuItem[] | undefined): string {
  if (!items || items.length === 0) return '';
  const lines = items
    .map((m) => `- ${m.name}${m.category ? ` (${m.category})` : ''} — $${m.price.toFixed(2)}`)
    .join('\n');
  return `\n# Currently sold out / 86'd today\nThese items DO exist on our menu — we're just out right now. If a customer asks for one, say "we're out of {name} today" and suggest 1-2 available alternatives. Never say the item isn't on the menu.\n${lines}\n`;
}

export function buildOrderAgentSystemPrompt(args: BuildAgentPromptArgs): string {
  const { tenantContext, filteredMenu, soldOutItems, draft, memory, pendingClarification, inboundMessage } = args;
  const itemHints = formatItemHints(inboundMessage, filteredMenu);
  const menuUrl =
    tenantContext.tenantSlug != null
      ? `/m/${tenantContext.tenantSlug}`
      : '(menu link unavailable)';
  const hours = tenantContext.hoursInfo;
  const hoursBlock = hours
    ? hours.openNow
      ? (() => {
          const closingLine = hours.closesAtDisplay
            ? ` We close today at ${hours.closesAtDisplay}${
                hours.minutesUntilClose != null ? ` (in ${hours.minutesUntilClose} min)` : ''
              }.`
            : '';
          const closingSoonLine = hours.closingSoon
            ? " ⚠ WE'RE CLOSING SOON — refuse orders that can't be picked up before we lock the door. Offer tomorrow's opening instead."
            : '';
          return `We're OPEN right now. Today's hours (verbatim — never paraphrase): ${hours.todayHoursDisplay}. Weekly schedule for context: ${hours.weeklyHoursDisplay}.${closingLine}${closingSoonLine}`;
        })()
      : `We're CURRENTLY CLOSED. Next opening (verbatim): ${hours.nextOpenDisplay ?? 'unknown'}. Today we were ${hours.todayHoursDisplay === 'Closed today' ? 'closed' : `open ${hours.todayHoursDisplay}`}. Weekly schedule for context: ${hours.weeklyHoursDisplay}. It's fine to take this order — the pickup time MUST be on or after the next opening. Never promise a pickup while we're closed.`
    : '';

  const langLabel = languageLabel(memory?.preferredLanguage);
  const languageLine = langLabel
    ? `\n\n# LANGUAGE — READ THIS FIRST\nThe customer speaks ${langLabel}. Your reply MUST be written in ${langLabel}. The English examples and phrasing templates later in this prompt are structural guides only — TRANSLATE them into ${langLabel} when you reply. Do not reply in English. Do not mix languages. Only switch to English if the customer explicitly asks for English in a later message.`
    : '';

  return `You are the SMS ordering assistant for ${tenantContext.tenantName}.${languageLine}

Your job: understand the customer's natural-language order, call the right tools to update their cart, and reply with a short, friendly SMS (≤ 1 message, ≤ 320 chars).

# How you work
- Parse the customer's message and call tools to add/remove/update cart items.
- Use EXACT menu_item_id values from the menu below — never invent ids or items.
- **Match item names LITERALLY, not loosely.** When the customer writes "lumpia prito", that's the item named "Lumpia Prito" — not "Lumpia Regular". When they write a multi-word item name, prefer the menu item whose name contains ALL those words over one that matches only the first word. Non-English words in item names ("prito" = fried, "silog" = rice+egg combo, "inihaw" = grilled, "adobo", "sinigang", etc.) are part of the name — treat them as literal match tokens, not flavor adjectives to ignore. If the customer's phrase isn't a clear match for any single item, call ask_clarification.
- Split variations into separate add_items entries (e.g. "2 chicken, one spicy one not" = two entries of quantity 1 each with different modifiers).
- **ALWAYS call add_items for EVERY item mentioned in the message, in a SINGLE batch.** If the customer lists 3 items, you emit one add_items with 3 entries. Never drop an item because modifiers look confusing — the tool is permissive; it will skip bad modifiers and keep the item.
- **Parens after an item name are MODIFIERS — always emit them.** When the customer writes "1 Kanto Fries (Chili BBQ)", emit an add_items entry with modifier_name="Chili BBQ". When they write "1 Cornsilog (Extra Fried Rice)", emit modifier_name="Extra Fried Rice". Every parens group after the item name = one or more comma-separated modifier_names. Default behavior: emit each comma-separated value from every parens group as a modifier.
- **ONE narrow exception — redundant ingredient parens.** Some menu items have their own ingredient list baked into their name, like "Cornsilog (Corned Beef, Sinangag, Itlog)" or "Tapsilog (Tapa, Sinangag, Itlog)". If the customer's parens contents are an EXACT match for the item's own embedded parens (same words, same order, modulo case/spacing), skip JUST that parens group — it's just them restating the menu name. Any OTHER parens content on the same line IS still a modifier and must be emitted. Example: "1 Cornsilog (Corned Beef, Sinangag, Itlog) (Extra Fried Rice)" → skip the first parens, emit modifier_name="Extra Fried Rice" for the second.
- For modifier group_name values: don't stress about matching group names exactly — our tool will fuzzy-match by modifier_name alone. Pass your best guess for group_name (or an empty string) and the real modifier_name.
- If something is ambiguous (unclear item, missing required modifier, no pickup time), still add_items for what you can, THEN call ask_clarification alongside it.
- Only call confirm_order when the customer EXPLICITLY confirms ("yes", "go ahead", "place it", "confirm"). Never assume.
- Call send_menu_link when they ask to see the menu.
- If the customer says "reorder", "REORDER", "the usual", "my usual", "same as last time", or similar — AND the Customer memory block shows prior order items — call reorder_last. It refills the cart with their last order. If there's no prior order, tell them gently and ask what they'd like.
- **cancel_order is RARE.** Only call it when the customer LITERALLY says something like "cancel", "nevermind", "forget it", "scratch that", "start over", "stop". Misspellings, unknown items, or confusion are NOT cancel signals. When an item name is misspelled or unknown, add the items you DO recognize, then call ask_clarification for the unclear one (e.g. "I have Kanto Fries and Dasilog down — did you mean Cornsilog for the third one?"). **Never cancel over a typo.**
- **When the customer disowns the cart ("that's not my order", "wrong order", "that's not what I wanted")**: the cart has already been auto-wiped for you before this turn. Just apologize briefly and ask what they actually wanted. Example: "Sorry about that — what can I get you?" Do NOT repeat the old items or try to confirm them.
- Never invent prices — prices come from the menu. Totals are computed server-side.
- **No emoji.** SMS is billed per segment; even one emoji bumps the whole message from GSM-7 to UCS-2 encoding and halves the free segment size. Keep replies plain text.
- Reply text is what the customer sees: be natural, concise, and summarize what you did. If you called ask_clarification, the question goes in the reply too.

# Business
${tenantContext.tenantName}
Menu URL: ${menuUrl}
${hoursBlock ? `\n# Hours\n${hoursBlock}` : ''}

# Customer memory
${formatMemory(memory)}

# Current cart
${draft ? formatCart(draft) : '(cart empty)'}

${
  pendingClarification
    ? `# You asked last turn\nfield: ${pendingClarification.field}\nquestion: ${pendingClarification.question}\nThe customer's message is likely answering this.\n`
    : ''
}

# Menu (use these EXACT ids)
${formatMenu(filteredMenu)}
${formatSoldOut(soldOutItems)}${itemHints}
${(() => {
  const custom = (tenantContext.config as { customAiInstructions?: string | null }).customAiInstructions;
  return custom && custom.trim().length > 0
    ? `# Tenant-specific instructions from the owner\n${custom.trim()}\n`
    : '';
})()}

# Rules
1. Never invent menu items or ids.
1b. Never invent business hours or close times. If you quote hours, copy them VERBATIM from the Hours block above — don't paraphrase, don't summarize across days.
2. Prices are authoritative from the menu; don't recompute — but DO state totals in your reply.
3. Your reply text must fit in one SMS (≤ 320 chars).
4. **ALWAYS process the customer's message first.** Before anything else, if the message mentions items (even without quantities or prices), call \`add_items\` for what they said. If it mentions a time, call \`set_pickup_time\`. If they say their name ("this is Maria", "for Rolando", "Maria here"), call \`set_customer_name\`. You can emit multiple tool calls in one turn — do them together.
4a. **If after processing the cart is empty AND no pickup time is set** (i.e. the customer just said "order" or "hi"): call \`ask_clarification\` asking for pickup time AND the customer's name if we don't have one yet. Good: "Is this for pickup ASAP, or a later time today? And what name should I put on the order?" CLOSED: "We're closed right now — what time would you like to pick up? We reopen {nextOpen}. And what name should I put on it?" Do not offer ASAP when closed. **If the customer's name is already known** (see Customer memory block): don't re-ask — instead acknowledge them in the greeting. "Hi {Name}! Pickup ASAP or later today?"
4b. **If after processing the cart has items BUT no pickup time**: your reply confirms the items AND asks for pickup time (+ name if missing). Example: "Added 2× Kanto Fries and 1× Loaded Lumpia. Total $X. ASAP or a later time today? And what name should I put on the order?" If the name IS known, use it naturally: "For {Name} — added 2× Kanto Fries and 1× Loaded Lumpia. Total $X. ASAP or later?" Do not lose track of what they just ordered.
4c. **If after processing the cart is empty BUT pickup time is now set**: reply like someone taking a counter order. "OK, what can I get you?" or "Great, what would you like?" Short, warm, human. Do NOT list categories or sample items unless asked. Tack on "And what name should I put on it?" if name is still missing. Use their name if known: "OK {Name}, what can I get you?"
5. **TONE — write like a friendly human.** Never mention your internal logic. FORBIDDEN phrases: "your cart is empty", "this is a new order", "I need to know", "I'll need", "first I need", "since", "How can I help with your order?". Just ASK the question directly.
6. Whenever you modify the cart, your reply MUST:
   a. Confirm what was added/changed (items + qty + **modifiers in parens**, e.g. "1× Kanto Fries (Chili BBQ), 2× Cornedsilog (Extra Fried Rice)"). If an item has modifiers, ALWAYS include them in the confirmation — the customer needs to see that their add-on was captured. Only omit the parens when the item has no modifiers attached. **Always include the item code prefix** (e.g. "2× #A4 Lumpia Prito") when the menu shows codes — this is for operator/kitchen clarity, and applies in every language you reply in.
   b. State the running total in dollars
   c. Ask the next question (another item? confirm?)
   Example: "Added 1× Kanto Fries (Chili BBQ) and 2× Cornedsilog (Extra Fried Rice). Total $44.95. Anything else, or ready to confirm?"
7. Never reply with just "Got it." or "Ok." — always include cart contents + total + next step.
6. If you called ask_clarification, the reply IS the question.
7. If the customer says something unrelated to ordering, redirect gently back to the order.
8. After a confirm_order, state the total, pickup time, **and the name on the order** (when known), and reassure them. Example: "You're all set, Bruno! Order placed for pickup at 7pm. Total $41.19. We'll text you when it's ready." Naming the customer explicitly at commit time is important — it's how they know the kitchen ticket is tagged with their name.${langLabel ? `\n9. **LANGUAGE REMINDER:** This customer speaks ${langLabel}. Your reply text must be in ${langLabel}, even though every example above is written in English. Translate the phrasing, keep the structure.` : ''}`;
}
