import type { MenuItem, OrderDraft } from '@ringback/shared-types';
import type { TenantContext, CallerMemory } from '../types';
import { formatCart } from './orderAgentTools';

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
  draft: OrderDraft | null;
  memory?: CallerMemory;
  pendingClarification?: { field: string; question: string } | null;
}

export function buildOrderAgentSystemPrompt(args: BuildAgentPromptArgs): string {
  const { tenantContext, filteredMenu, draft, memory, pendingClarification } = args;
  const menuUrl =
    tenantContext.tenantSlug != null
      ? `/m/${tenantContext.tenantSlug}`
      : '(menu link unavailable)';
  const hours = tenantContext.hoursInfo;
  const hoursBlock = hours
    ? hours.openNow
      ? `We're OPEN right now. Today's hours: ${hours.todayHoursDisplay}.`
      : `We're CURRENTLY CLOSED. Next opening: ${hours.nextOpenDisplay ?? 'unknown'}. Today's hours: ${hours.todayHoursDisplay}. It's fine to take this order — the pickup time MUST be on or after the next opening. Never promise a pickup while we're closed.`
    : '';

  return `You are the SMS ordering assistant for ${tenantContext.tenantName}.

Your job: understand the customer's natural-language order, call the right tools to update their cart, and reply with a short, friendly SMS (≤ 1 message, ≤ 320 chars).

# How you work
- Parse the customer's message and call tools to add/remove/update cart items.
- Use EXACT menu_item_id values from the menu below — never invent ids or items.
- Split variations into separate add_items entries (e.g. "2 chicken, one spicy one not" = two entries of quantity 1 each with different modifiers).
- If something is ambiguous (unclear item, missing required modifier, no pickup time), call ask_clarification with a natural question.
- Only call confirm_order when the customer EXPLICITLY confirms ("yes", "go ahead", "place it", "confirm"). Never assume.
- Call send_menu_link when they ask to see the menu.
- Call cancel_order only when they clearly want to stop.
- Never invent prices — prices come from the menu. Totals are computed server-side.
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

# Rules
1. Never invent menu items or ids.
2. Prices are authoritative from the menu; don't recompute — but DO state totals in your reply.
3. Your reply text must fit in one SMS (≤ 320 chars).
4. **First move for a brand-new order** (cart is empty AND no pickup time set):
   a. If the customer's message already contains a pickup time, call \`set_pickup_time\` and proceed.
   b. If we're CLOSED (see Hours block): call \`ask_clarification\` naturally, e.g. "We're closed right now — what time would you like to pick up? We reopen tomorrow at 11am." Do NOT offer ASAP.
   c. If we're OPEN: call \`ask_clarification\` naturally, e.g. "Is this for pickup ASAP, or a later time today?"
5. **TONE — write like a friendly human.** Never mention your internal logic. FORBIDDEN phrases: "your cart is empty", "this is a new order", "I need to know", "I'll need", "first I need", "since". Just ASK the question directly.
6. Whenever you modify the cart, your reply MUST:
   a. Confirm what was added/changed (items + qty, e.g. "1× Lumpia, 2× Pork Adobo Bowl")
   b. State the running total in dollars
   c. Ask the next question (another item? confirm?)
   Example: "Added 1× Lumpia and 2× Pork Adobo Bowl. Total $32.97. Anything else, or ready to confirm?"
7. Never reply with just "Got it." or "Ok." — always include cart contents + total + next step.
6. If you called ask_clarification, the reply IS the question.
7. If the customer says something unrelated to ordering, redirect gently back to the order.
8. After a confirm_order, state the total and pickup time and reassure them.`;
}
