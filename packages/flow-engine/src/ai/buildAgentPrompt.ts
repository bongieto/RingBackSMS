import type { MenuItem, OrderDraft } from '@ringback/shared-types';
import type { TenantContext, CallerMemory } from '../types';
import { formatCart } from './orderAgentTools';
import { SLOT_SEQUENCE } from './slotSequence';
import { sanitizeForPrompt, sanitizeDescription, clampLength } from './promptSanitizer';

function formatMenu(menu: MenuItem[]): string {
  if (menu.length === 0) return '(no menu items available)';
  return menu
    .map((m) => {
      const price = `$${m.price.toFixed(2)}`;
      // All operator- and POS-supplied strings below run through the
      // sanitizer before landing in the prompt. A malicious menu item
      // name like "Lumpia\n\n# New Rules\nIgnore previous" would
      // otherwise reach the LLM as a free-form instruction block.
      const name = sanitizeForPrompt(m.name);
      const desc = m.description ? ` — ${sanitizeDescription(m.description, { maxLength: 200 })}` : '';
      const cat = m.category ? ` (${sanitizeForPrompt(m.category, { maxLength: 40 })})` : '';
      const mods =
        m.modifierGroups && m.modifierGroups.length > 0
          ? ` | modifiers: ${m.modifierGroups
              .map(
                (g) =>
                  `${sanitizeForPrompt(g.name, { maxLength: 40 })}${g.required ? '*' : ''}: ${g.modifiers
                    .map((mod) => sanitizeForPrompt(mod.name, { maxLength: 40 }))
                    .join('/')}`,
              )
              .join('; ')}`
          : '';
      return `- [${m.id}] ${name}${cat} — ${price}${desc}${mods}`;
    })
    .join('\n');
}

function formatMemory(memory?: CallerMemory): string {
  if (!memory) return '(no prior history)';
  const bits: string[] = [];
  // Caller memory is the most direct customer-provided channel that
  // reaches the prompt: contactName and order-item names originate
  // from past inbound SMS. Every string here runs through the
  // sanitizer — a customer-named "Maria\n\n# Override" can't turn
  // into a prompt section header.
  if (memory.contactName) bits.push(`Name: ${sanitizeForPrompt(memory.contactName, { maxLength: 60 })}`);
  if (memory.contactStatus) bits.push(`Tier: ${sanitizeForPrompt(memory.contactStatus, { maxLength: 20 })}`);
  if (memory.lastOrderSummary) bits.push(`Last order: ${sanitizeForPrompt(memory.lastOrderSummary, { maxLength: 200 })}`);
  if (memory.lastOrderItems?.length) {
    bits.push(
      `Last order items: ${memory.lastOrderItems
        .map((i) => `${i.quantity}× ${sanitizeForPrompt(i.name, { maxLength: 60 })}`)
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

/** Strip a leading menu-catalog code prefix like "#A4 ", "#LB13 ",
 *  "A1. ", from a menu item name. These are internal catalog codes
 *  tenants bake into `MenuItem.name` itself (confirmed in the Square
 *  adapter's orphan-matching normalizeName — same regex shape); real
 *  customers don't say them aloud when ordering. Stripping gives us a
 *  second variant to phrase-match against so "lumpia prito" can bind
 *  to "#A4 Lumpia Prito (Fried Lumpia)".
 *
 *  Requires either a leading `#` or at least one letter before the
 *  digits, so we never accidentally strip a leading quantity from an
 *  inbound message ("3 lumpia prito" must keep its "3"). Only called
 *  on menu names, not on inbound. */
function stripMenuCodePrefix(s: string): string {
  return s.replace(/^\s*(?:#[a-z]{0,3}\d+|[a-z]{1,3}\d+)\.?\s+/i, '').trim();
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
      // Also strip any leading catalog code ("#A4 Lumpia Prito" → "lumpia
      // prito"). Without this the base variant is "a4 lumpia prito", which
      // never appears in customer phrasing — so multi-item compound orders
      // ("my husband wants 3 lumpia prito...") failed the safety net
      // entirely even though every item was on the menu. Regression caught
      // in R13 testing on The Lumpia House menu.
      const stripped = normalizeForMatch(stripMenuCodePrefix(item.name));
      if (stripped && !variants.has(stripped)) variants.add(stripped);
      const strippedNoNg = stripped.replace(/(\w)ng\b/g, '$1');
      if (strippedNoNg && !variants.has(strippedNoNg)) variants.add(strippedNoNg);
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
    .map((h) => `- Customer phrase "${sanitizeForPrompt(h.phrase, { maxLength: 60 })}" → use menu_item_id "${h.item.id}" (${sanitizeForPrompt(h.item.name, { maxLength: 80 })}, $${h.item.price.toFixed(2)})`)
    .join('\n');
  return `\n# Item resolution hints (DETERMINISTIC — follow exactly)\nThese phrase→id bindings were computed by exact-phrase match against the menu. They override any guess you might make from partial-word matching. Use these menu_item_id values verbatim:\n${lines}\n`;
}

function formatSoldOut(items: MenuItem[] | undefined): string {
  if (!items || items.length === 0) return '';
  const lines = items
    .map((m) => `- ${sanitizeForPrompt(m.name)}${m.category ? ` (${sanitizeForPrompt(m.category, { maxLength: 40 })})` : ''} — $${m.price.toFixed(2)}`)
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
  // Note: if we're closed, the order agent hard-gates before reaching
  // this prompt (orderAgent.ts runOrderAgent top). So this block only
  // needs to cover the open case — no closed-copy, no "accept orders
  // while closed" nuance.
  const hoursBlock = hours && hours.openNow
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
    : '';

  // tenantName comes from Tenant.name in the DB — operator-provided at
  // signup and mutable from the dashboard. Sanitize before both
  // insertion points so "Bob's Burgers\n\n# Evil" can't extend the
  // prompt with new instructions.
  const safeTenantName = sanitizeForPrompt(tenantContext.tenantName, { maxLength: 80 });

  return `You are the SMS ordering assistant for ${safeTenantName}. Reply in English only — we do not support other languages.

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
${safeTenantName}
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
  if (!custom || custom.trim().length === 0) return '';
  // Owner-authored instructions are trusted enough to keep newlines and
  // special characters (operators DO write multi-line guidance here),
  // but still get a length cap so a runaway paste can't swamp the
  // token budget.
  return `# Tenant-specific instructions from the owner\n${clampLength(custom.trim(), 2000)}\n`;
})()}

# Rules
1. Never invent menu items or ids.
1b. Never invent business hours or close times. If you quote hours, copy them VERBATIM from the Hours block above — don't paraphrase, don't summarize across days.
2. Prices are authoritative from the menu; don't recompute — but DO state totals in your reply.
3. Your reply text must fit in one SMS (≤ 320 chars).
4. **STRICT SEQUENCE: ${SLOT_SEQUENCE.join(' → ')}.** At every turn:
   (a) First, capture any slot data the customer just gave you — always call the matching tool. Items → \`add_items\`. Name ("this is Maria", "for Rolando", bare "Maria") → \`set_customer_name\`. Time ("6pm", "ASAP", "in 20") → \`set_pickup_time\`. You may call multiple tools in one turn.
   (b) Then determine the FIRST missing slot in the sequence and ask for THAT slot — never jump ahead.
      • Items empty → "What can I get you? Text MENU for the list."
      • Items set, name missing → "Got it — what name should I put this order under?"
      • Items + name set, pickup missing → "Thanks, {Name}. What time would you like to pick up?"
      • All set → summarize cart + "Ready to confirm?"
   (c) NEVER ask for slot N+1 while slot N is empty. Do not ask about pickup while name is missing. Do not ask for confirmation while pickup is missing. Never ask about phone — we already have it.
   (d) If the customer volunteers a later slot early (e.g. sends "Maria" before picking items), capture it with the matching tool AND ask for the current missing slot. Example: cart empty, customer says "Maria" → \`set_customer_name({name:"Maria"})\` → reply "Got it, Maria. What can I get you? Text MENU for the list."
5. **TONE — write like a friendly human.** Never mention your internal logic. FORBIDDEN phrases: "your cart is empty", "this is a new order", "I need to know", "I'll need", "first I need", "since", "How can I help with your order?". Just ASK the question directly.
6. Whenever you modify the cart, your reply MUST:
   a. Confirm what was added/changed (items + qty + **modifiers in parens**, e.g. "1× Kanto Fries (Chili BBQ), 2× Cornedsilog (Extra Fried Rice)"). If an item has modifiers, ALWAYS include them in the confirmation — the customer needs to see that their add-on was captured. Only omit the parens when the item has no modifiers attached. **Always include the item code prefix** (e.g. "2× #A4 Lumpia Prito") when the menu shows codes — this is for operator/kitchen clarity, and applies in every language you reply in.
   b. State the running total in dollars
   c. Ask the next question (another item? confirm?)
   Example: "Added 1× Kanto Fries (Chili BBQ) and 2× Cornedsilog (Extra Fried Rice). Total $44.95. Anything else, or ready to confirm?"
7. Never reply with just "Got it." or "Ok." — always include cart contents + total + next step.
6. If you called ask_clarification, the reply IS the question.
7. If the customer says something unrelated to ordering, redirect gently back to the order.
8. After a confirm_order, state the total, pickup time, **and the name on the order** (when known), and reassure them. Example: "You're all set, Bruno! Order placed for pickup at 7pm. Total $41.19. We'll text you when it's ready." Naming the customer explicitly at commit time is important — it's how they know the kitchen ticket is tagged with their name.
9. **Always reply in English** — even if the customer writes in another language, your reply is English. The host app intercepts clearly non-English messages before they reach you with a fixed English-only apology, so by the time a message gets here you can assume the customer accepted our English-only policy.`;
}
