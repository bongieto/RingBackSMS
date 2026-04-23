/**
 * Pure helpers extracted from orderAgent.ts.
 *
 * Every function in this file is referentially transparent — no I/O,
 * no FlowInput, no Prisma. Moving them out lets orderAgent.ts focus
 * on orchestration and makes each helper independently unit-testable
 * without standing up a full FlowInput fixture.
 *
 * Scope is deliberately narrow: input-parsing heuristics and pure
 * output formatters. The safety-net blocks inside runOrderAgent still
 * live there because they close over `input`, `draft`, `capturedName`,
 * and the LLM response — extracting those would force us to pass a
 * mutable bag of locals around, which is worse than the current
 * function-as-outline structure.
 */
import type { OrderDraft } from '@ringback/shared-types';

/**
 * Claude sometimes emits reasoning wrapped in `<think>…</think>` tags
 * (even outside extended-thinking mode). Strip those before shipping
 * the reply as an SMS — nobody wants to see the model's internal
 * monologue as text to the customer.
 */
export function stripThinkTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
    // Also strip a dangling open <think> with no close — happens when
    // max_tokens cut the response mid-reasoning. In that case EVERYTHING
    // from <think> onward is thinking-content we don't want to ship.
    .replace(/<think>[\s\S]*$/i, '')
    .trim();
}

/**
 * Heuristic: is this message the customer (re)stating their entire
 * order rather than adding to an existing cart? Captures "Order: ...",
 * "I want ...", bullet-list phrasing, AND the menu-page-generated
 * format "N #code item name". When TRUE and the cart is non-empty, we
 * wipe the cart first so Claude doesn't pile new items on top of
 * forgotten prior attempts.
 */
export function looksLikeFreshOrderList(msg: string): boolean {
  const trimmed = msg.trim();

  // Explicit ADD-intent prefixes short-circuit to FALSE. "add 1 #a1" /
  // "also two fries" are continuations of the existing cart, not
  // fresh-order lists. Without this check the hash-code rule below
  // would false-positive on "add #a6".
  if (/^(add\b|also\b|and\b|plus\b|one more\b|another\b|one more of\b|give me (?:one|a|another) more\b)/i.test(trimmed)) {
    return false;
  }

  // STRONG SIGNAL: the message begins with a menu-item hash code.
  // Our menu page generates SMS drafts in the format
  //   "Order: N #code item"  OR  "N #code item"  OR  "#code"
  // and customers who tap the menu link always get one of those. Nothing
  // else in the conversation corpus uses `#<short-alnum>` as a prefix,
  // so false-positive risk is near zero. This catches the case where a
  // customer re-taps the menu link and sends "1 #a1 lumpia regular" —
  // which looked like a bare add to the prior heuristic.
  if (/^\s*\d*\s*#[a-z0-9]{1,8}\b/i.test(trimmed)) return true;

  // Otherwise: require an intent phrase + item signal + plausible length.
  const hasIntent = /^(order\s*:|i(?:'ll| would like| want| need| want to order)|can i (?:get|have|order)|(?:can we|we'd like to|we want to|we would like to) (?:get|have|order)|let me (?:get|have)|i'll have|gimme|we want|we need)\b/i.test(
    trimmed,
  );
  if (!hasIntent) return false;
  const hasQuantityOrArticle = /\b(\d+|a|an|the|some|another|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(
    trimmed,
  );
  if (!hasQuantityOrArticle) return false;
  // "I want it" / "I'll have" alone isn't a fresh order list — it's a
  // reference. Require some body.
  return trimmed.length >= 10;
}

/**
 * Heuristic: is the customer disowning what the bot just echoed?
 * "that's not my order", "wrong order", "no that's wrong", etc. When
 * TRUE, wipe the cart so the next turn starts clean.
 */
export function looksLikeRejectCart(msg: string): boolean {
  const trimmed = msg.trim();
  return /\b(that'?s not (my|the|what)|not my order|wrong order|that'?s wrong|nope that'?s wrong|incorrect order|that'?s not what|you got it wrong)\b/i.test(
    trimmed,
  );
}

/**
 * Deterministic pickup-time parser — used as a fallback when Claude
 * doesn't call set_pickup_time on a short reply to "what time?". We
 * don't need to resolve this into a timestamp (the owner reads the
 * pickup string verbatim); we just need to accept a plausible time
 * phrase and save it. Returns the normalized string or null.
 */
export function parsePickupPhrase(raw: string): string | null {
  const msg = raw.trim();
  if (!msg) return null;
  // "asap", "now", "whenever" etc.
  if (/^(asap|now|right now|immediately|whenever|any ?time|as soon as possible|soon)\b/i.test(msg)) {
    return msg.toLowerCase();
  }
  // Explicit time + optional day: "11:30am tuesday", "tuesday 12pm",
  // "schedule for tuesday 12pm", "tomorrow at 1pm", "in 30 minutes",
  // "in an hour", "8:30 tonight", "noon", "midnight".
  const hasClockTime = /\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\b/i.test(msg);
  const hasRelative = /\b(in\s+(a|an|\d+)\s+(min(ute)?s?|hour|hours|hr|hrs))\b/i.test(msg);
  const hasNamedTime = /\b(noon|midnight|tonight|morning|afternoon|evening)\b/i.test(msg);
  const hasDay = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|weds|wed|thurs|thur|thu|fri|sat|sun)\b/i.test(msg);
  if (hasClockTime || hasRelative || hasNamedTime || (hasDay && /\d/.test(msg))) {
    // Strip filler "schedule for ", "pickup at ", "for " prefixes.
    return msg
      .replace(/^(schedule(d)?\s+(it\s+)?(for|at)\s+|pick ?up\s+(at|for)\s+|at\s+|for\s+)/i, '')
      .trim()
      .toLowerCase();
  }
  return null;
}

/** Deep clone of an OrderDraft. Items and modifier arrays are copied
 *  shallowly (each item object is recreated), so mutation of the clone
 *  doesn't leak back into the caller's state. */
export function cloneDraft(d: OrderDraft | null | undefined): OrderDraft {
  if (!d) return { items: [] };
  return {
    items: d.items.map((i) => ({
      ...i,
      selectedModifiers: i.selectedModifiers ? [...i.selectedModifiers] : undefined,
    })),
    pickupTime: d.pickupTime,
    notes: d.notes,
  };
}

/**
 * Compact kitchen-ticket / owner-notification rendering of order
 * items. One line per item with quantity + name + bracketed modifier
 * list. The same format gets used in the NOTIFY_OWNER side-effect
 * message and the confirm-step summary, so keeping it single-sourced
 * matters for consistency.
 */
export function buildOwnerOrderSummary(items: OrderDraft['items']): string {
  return items
    .map((i) => {
      const mods = i.selectedModifiers?.length
        ? ` [${i.selectedModifiers.map((m) => `${m.groupName}: ${m.modifierName}`).join(', ')}]`
        : '';
      return `${i.quantity}× ${i.name}${mods}`;
    })
    .join('\n');
}

/**
 * Canonical per-slot prompt text. Used by the strict-sequence enforcer
 * when the LLM's proposed reply doesn't match the first-missing-slot
 * question. Keep these short — they're the bot's voice at each step of
 * the ladder.
 */
export function canonicalPrompt(
  missing: 'items' | 'name' | 'pickup' | 'confirm',
  draft: OrderDraft,
  name: string | null,
): string {
  switch (missing) {
    case 'items':
      return name
        ? `Got it, ${name}. What can I get you? Text MENU for the list.`
        : `What can I get you? Text MENU for the list.`;
    case 'name':
      return `What name should I put this order under?`;
    case 'pickup':
      return `What time would you like to pick up?`;
    case 'confirm': {
      const summary = buildOwnerOrderSummary(draft.items).replace(/\n/g, ', ');
      const pickup = draft.pickupTime ? ` Pickup ${draft.pickupTime}.` : '';
      return `${summary}.${pickup} Ready to confirm?`;
    }
  }
}
