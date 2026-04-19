import { z } from 'zod';
import type { MenuItem, OrderDraft, SelectedModifier } from '@ringback/shared-types';

// ── Anthropic-format tool schemas ─────────────────────────────────────────────
// These describe the tools Claude can call. Server-side we validate the input
// against Zod schemas (below) and execute deterministic handlers against a
// cloned OrderDraft — Claude never mutates state directly.

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const ORDER_AGENT_TOOLS: ToolSchema[] = [
  {
    name: 'add_items',
    description:
      "Add one or more items to the customer's cart. Use the exact menu_item_id from the menu context. Split variations with different modifiers into separate entries (e.g. \"one spicy, one not\" = two entries).",
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Items to add',
          items: {
            type: 'object',
            properties: {
              menu_item_id: { type: 'string', description: 'The menu item id from the context' },
              quantity: { type: 'integer', minimum: 1, maximum: 20 },
              modifiers: {
                type: 'array',
                description: 'Modifier selections like spicy/not, size, etc.',
                items: {
                  type: 'object',
                  properties: {
                    group_name: { type: 'string' },
                    modifier_name: { type: 'string' },
                  },
                  required: ['group_name', 'modifier_name'],
                },
              },
              notes: { type: 'string', description: 'Per-line notes, e.g. "no onions"' },
            },
            required: ['menu_item_id', 'quantity'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'add_items_for_person',
    description:
      'Same as add_items, but tags every line with a person name. Use when the customer says things like "Maria wants a burger" or "For Dad, get the pancit". The kitchen ticket groups the order by person so prep staff can bag them separately.',
    input_schema: {
      type: 'object',
      properties: {
        person_name: { type: 'string', description: 'Who these items are for (e.g. "Maria", "Dad", "kids").' },
        items: {
          type: 'array',
          description: 'Items for this person',
          items: {
            type: 'object',
            properties: {
              menu_item_id: { type: 'string' },
              quantity: { type: 'integer', minimum: 1, maximum: 20 },
              modifiers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    group_name: { type: 'string' },
                    modifier_name: { type: 'string' },
                  },
                  required: ['group_name', 'modifier_name'],
                },
              },
              notes: { type: 'string' },
            },
            required: ['menu_item_id', 'quantity'],
          },
        },
      },
      required: ['person_name', 'items'],
    },
  },
  {
    name: 'remove_item',
    description: 'Remove all entries for a menu item from the cart.',
    input_schema: {
      type: 'object',
      properties: {
        menu_item_id: { type: 'string' },
      },
      required: ['menu_item_id'],
    },
  },
  {
    name: 'update_quantity',
    description: 'Change the quantity of an existing cart line for a menu item.',
    input_schema: {
      type: 'object',
      properties: {
        menu_item_id: { type: 'string' },
        quantity: { type: 'integer', minimum: 1, maximum: 20 },
      },
      required: ['menu_item_id', 'quantity'],
    },
  },
  {
    name: 'set_pickup_time',
    description: 'Set the customer\'s desired pickup time (free-form string, e.g. "asap", "in 30 min", "6:30pm").',
    input_schema: {
      type: 'object',
      properties: {
        when: { type: 'string' },
      },
      required: ['when'],
    },
  },
  {
    name: 'set_order_notes',
    description: 'Attach free-form notes to the whole order (e.g. allergy info, "leave at door").',
    input_schema: {
      type: 'object',
      properties: {
        notes: { type: 'string' },
      },
      required: ['notes'],
    },
  },
  {
    name: 'confirm_order',
    description:
      'Signal that the customer has explicitly confirmed and wants to place the order. ONLY call when the customer said something like "yes", "confirm", "go ahead", "place it", "ok" in direct response to a confirmation prompt.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cancel_order',
    description: 'Clear the cart and end the order flow (customer changed their mind).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'send_menu_link',
    description: "Signal that the customer wants the web menu URL. Use when they ask to see the menu.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'ask_clarification',
    description:
      "Ask the customer a clarifying question when you can't confidently fill a required slot (e.g. modifier choice, pickup time, ambiguous item name).",
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The exact wording to send back' },
        missing_field: {
          type: 'string',
          description: 'Machine-readable name of the field being asked about, e.g. "pickup_time", "modifier_for_combo_1"',
        },
      },
      required: ['question', 'missing_field'],
    },
  },
  {
    name: 'reorder_last',
    description:
      "Repopulate the cart with the customer's most recent order. Call this when the customer says something like 'the usual', 'same as last time', 'reorder', 'REORDER', 'my usual'. Only works if we have a prior order for this caller — the customer memory block will show it under 'Last order items'. Items from the last order that are no longer on the menu are silently skipped.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'set_customer_name',
    description:
      "Capture the customer's name (usually first name) for the order. Call this any time the customer tells you their name, e.g. 'for Maria' or 'Rolando here'. The name appears on the kitchen ticket, the READY SMS, and the receipt.",
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: "The customer's name as they gave it. First name only is fine.",
        },
      },
      required: ['name'],
    },
  },
];

// ── Zod input validators ──────────────────────────────────────────────────────

export const AddItemsInput = z.object({
  items: z
    .array(
      z.object({
        menu_item_id: z.string(),
        quantity: z.number().int().min(1).max(20),
        modifiers: z
          .array(
            z.object({
              group_name: z.string(),
              modifier_name: z.string(),
            }),
          )
          .optional(),
        notes: z.string().optional(),
      }),
    )
    .min(1),
});

export const AddItemsForPersonInput = AddItemsInput.extend({
  person_name: z.string().trim().min(1).max(40),
});

export const RemoveItemInput = z.object({ menu_item_id: z.string() });
export const UpdateQuantityInput = z.object({
  menu_item_id: z.string(),
  quantity: z.number().int().min(1).max(20),
});
export const SetPickupTimeInput = z.object({ when: z.string().min(1).max(100) });
export const SetOrderNotesInput = z.object({ notes: z.string().max(500) });
export const AskClarificationInput = z.object({
  question: z.string().min(1).max(320),
  missing_field: z.string().min(1).max(80),
});

export const SetCustomerNameInput = z.object({
  name: z.string().trim().min(1).max(80),
});

// ── Tool execution result ─────────────────────────────────────────────────────

export type ToolResult =
  | { ok: true; kind: 'mutated'; message?: string }
  | { ok: true; kind: 'confirm' }
  | { ok: true; kind: 'cancel' }
  | { ok: true; kind: 'menu_link' }
  | { ok: true; kind: 'clarification'; question: string; field: string }
  | { ok: true; kind: 'customer_name'; name: string }
  | { ok: true; kind: 'reorder'; added: number; skipped: number }
  | { ok: false; error: string };

// ── Handlers: operate on a cloned OrderDraft ──────────────────────────────────

function findMenuItem(menu: MenuItem[], id: string): MenuItem | undefined {
  return menu.find((m) => m.id === id && m.isAvailable !== false);
}

/** Case-and-whitespace-insensitive normalization used for every menu-data
 *  comparison. Merchants in the wild type "Extra Garlic  Rice" with
 *  double spaces, "extra  corned beef", etc. — we don't want a single
 *  typo'd space to drop a paying modifier. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Resolve modifier group+name pairs against the menu item's modifierGroups,
 *  returning the SelectedModifier array we persist in the cart.
 *
 *  Matching strategy, most-to-least specific:
 *    1. Exact (normalized) match on group name + modifier name.
 *    2. If the group name didn't match but the modifier name is unique
 *       across this item's groups → use that group.
 *    3. Fail.
 *
 *  This tolerates operators who type "Add Ons" vs "Add-ons", agents who
 *  guess the wrong group_name, and items whose name includes
 *  parenthetical content (e.g. "Cornsilog (Corned Beef, Sinangag,
 *  Itlog)") — the first parens is descriptive, not a modifier. */
function resolveModifiers(
  item: MenuItem,
  raw: Array<{ group_name: string; modifier_name: string }>,
): { ok: true; mods: SelectedModifier[] } | { ok: false; error: string } {
  const mods: SelectedModifier[] = [];
  for (const r of raw) {
    const wantModifier = normalize(r.modifier_name);
    const wantGroup = normalize(r.group_name);

    // Attempt 1: exact group + modifier match.
    let group = item.modifierGroups?.find((g) => normalize(g.name) === wantGroup);
    let mod = group?.modifiers.find((m) => normalize(m.name) === wantModifier);

    // Attempt 2: ignore group_name, find the modifier anywhere on this item.
    if (!mod) {
      for (const g of item.modifierGroups ?? []) {
        const candidate = g.modifiers.find((m) => normalize(m.name) === wantModifier);
        if (candidate) {
          group = g;
          mod = candidate;
          break;
        }
      }
    }

    if (!group || !mod) {
      return {
        ok: false,
        error: `"${r.modifier_name}" isn't a valid option for ${item.name}`,
      };
    }
    mods.push({
      groupName: group.name,
      modifierName: mod.name,
      priceAdjust: mod.priceAdjust,
    });
  }
  return { ok: true, mods };
}

export function emptyDraft(): OrderDraft {
  return { items: [] };
}

export function handleAddItems(
  draft: OrderDraft,
  menu: MenuItem[],
  raw: unknown,
  opts?: { personName?: string },
): ToolResult {
  const parsed = AddItemsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid add_items input' };

  const personName = opts?.personName?.trim() || undefined;

  // Be permissive: if ONE line in the batch has a bad modifier or an
  // unknown menu_item_id, keep the valid ones and surface the bad ones
  // via skipped[]. Previously this short-circuited at the first failure,
  // silently dropping every subsequent item in the batch — customers
  // would text "A, B, C" and only get "A" back with no explanation.
  const skipped: string[] = [];
  for (const req of parsed.data.items) {
    const menuItem = findMenuItem(menu, req.menu_item_id);
    if (!menuItem) {
      skipped.push(`item id ${req.menu_item_id} not on menu`);
      continue;
    }
    let selectedModifiers: SelectedModifier[] | undefined;
    if (req.modifiers && req.modifiers.length > 0) {
      const r = resolveModifiers(menuItem, req.modifiers);
      if (!r.ok) {
        // Degrade gracefully: add the item without modifiers and remember
        // to clarify later. A bare Cornsilog is more useful than a
        // dropped Cornsilog.
        skipped.push(`${menuItem.name}: ${r.error}`);
        selectedModifiers = undefined;
      } else {
        selectedModifiers = r.mods;
      }
    }

    // Consolidate: if a line for this exact menu_item + modifiers + notes
    // + person already exists, bump its quantity. Different people keep
    // separate lines so the kitchen ticket can group by person.
    const existing = draft.items.find(
      (line) =>
        line.menuItemId === menuItem.id &&
        (line.notes ?? '') === (req.notes ?? '') &&
        (line.personName ?? '') === (personName ?? '') &&
        modifiersEqual(line.selectedModifiers, selectedModifiers),
    );
    if (existing) {
      existing.quantity += req.quantity;
      existing.confirmed = false;
    } else {
      draft.items.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: req.quantity,
        price: menuItem.price,
        selectedModifiers,
        confirmed: false,
        notes: req.notes,
        personName,
      });
    }
  }
  // Something was added → success, even if some lines were skipped. The
  // reply wording can acknowledge the skips; we don't need the agent to
  // treat this as a failure.
  const added = parsed.data.items.length - skipped.length;
  if (added <= 0) {
    return { ok: false, error: skipped.join('; ') || 'no items added' };
  }
  return {
    ok: true,
    kind: 'mutated',
    message: skipped.length > 0 ? `skipped: ${skipped.join('; ')}` : undefined,
  };
}

export function handleAddItemsForPerson(
  draft: OrderDraft,
  menu: MenuItem[],
  raw: unknown,
): ToolResult {
  const parsed = AddItemsForPersonInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid add_items_for_person input' };
  return handleAddItems(draft, menu, { items: parsed.data.items }, { personName: parsed.data.person_name });
}

function modifiersEqual(
  a: SelectedModifier[] | undefined,
  b: SelectedModifier[] | undefined,
): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  const key = (m: SelectedModifier) => `${m.groupName}::${m.modifierName}`;
  const sa = aa.map(key).sort();
  const sb = bb.map(key).sort();
  return sa.every((v, i) => v === sb[i]);
}

export function handleRemoveItem(draft: OrderDraft, raw: unknown): ToolResult {
  const parsed = RemoveItemInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid remove_item input' };
  const before = draft.items.length;
  draft.items = draft.items.filter((i) => i.menuItemId !== parsed.data.menu_item_id);
  if (draft.items.length === before) {
    return { ok: false, error: 'item not in cart' };
  }
  return { ok: true, kind: 'mutated' };
}

export function handleUpdateQuantity(draft: OrderDraft, raw: unknown): ToolResult {
  const parsed = UpdateQuantityInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid update_quantity input' };
  const line = draft.items.find((i) => i.menuItemId === parsed.data.menu_item_id);
  if (!line) return { ok: false, error: 'item not in cart' };
  line.quantity = parsed.data.quantity;
  return { ok: true, kind: 'mutated' };
}

export function handleSetPickupTime(draft: OrderDraft, raw: unknown): ToolResult {
  const parsed = SetPickupTimeInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid set_pickup_time input' };
  draft.pickupTime = parsed.data.when;
  return { ok: true, kind: 'mutated' };
}

export function handleSetOrderNotes(draft: OrderDraft, raw: unknown): ToolResult {
  const parsed = SetOrderNotesInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid set_order_notes input' };
  draft.notes = parsed.data.notes;
  return { ok: true, kind: 'mutated' };
}

export function handleAskClarification(raw: unknown): ToolResult {
  const parsed = AskClarificationInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid ask_clarification input' };
  return {
    ok: true,
    kind: 'clarification',
    question: parsed.data.question,
    field: parsed.data.missing_field,
  };
}

/**
 * Refill the cart from the caller's last order. Items whose menu_item_id
 * no longer maps to an available menu item are dropped silently — the
 * reply wording tells the customer how many items were skipped so they
 * can decide whether to order the rest. Modifiers are NOT carried over:
 * we only persist menuItemId+quantity in CallerMemory.lastOrderItems,
 * and re-resolving modifier names across menu edits is too brittle. The
 * customer can re-specify "spicy" etc. in the same message if they want.
 */
export function handleReorderLast(
  draft: OrderDraft,
  menu: MenuItem[],
  lastItems: Array<{ menuItemId: string; name: string; quantity: number; price: number }> | undefined,
):
  | { ok: true; kind: 'reorder'; added: number; skipped: number }
  | { ok: false; error: string } {
  if (!lastItems || lastItems.length === 0) {
    return { ok: false, error: 'no prior order on file' };
  }
  let added = 0;
  let skipped = 0;
  for (const prev of lastItems) {
    const menuItem = findMenuItem(menu, prev.menuItemId);
    if (!menuItem) {
      skipped += 1;
      continue;
    }
    // Merge into an existing identical line instead of duplicating.
    const existing = draft.items.find(
      (line) =>
        line.menuItemId === menuItem.id &&
        (line.notes ?? '') === '' &&
        modifiersEqual(line.selectedModifiers, undefined),
    );
    if (existing) {
      existing.quantity += prev.quantity;
      existing.confirmed = false;
    } else {
      draft.items.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: prev.quantity,
        price: menuItem.price,
        confirmed: false,
      });
    }
    added += 1;
  }
  if (added === 0) {
    return { ok: false, error: 'none of the prior items are still on the menu' };
  }
  return { ok: true, kind: 'reorder', added, skipped };
}

export function handleSetCustomerName(raw: unknown):
  | { ok: true; kind: 'customer_name'; name: string }
  | { ok: false; error: string } {
  const parsed = SetCustomerNameInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid set_customer_name input' };
  return { ok: true, kind: 'customer_name', name: parsed.data.name };
}

/** Compute order subtotal including modifier price adjustments. */
export function computeTotal(draft: OrderDraft): number {
  let total = 0;
  for (const line of draft.items) {
    const modAdj =
      line.selectedModifiers?.reduce((s, m) => s + (m.priceAdjust ?? 0), 0) ?? 0;
    total += (line.price + modAdj) * line.quantity;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Compute the full price breakdown customers see: items subtotal, sales
 * tax, optional Stripe-fee pass-through, and final total. Stripe US
 * pricing is 2.9% + $0.30; we apply it to (subtotal + tax) which is
 * what they're actually processing. Rounds every line to cents.
 */
export function computeOrderTotals(
  draft: OrderDraft,
  cfg: { salesTaxRate?: number | null; passStripeFeesToCustomer?: boolean | null },
): { subtotal: number; tax: number; fee: number; total: number } {
  const subtotal = computeTotal(draft);
  const tax =
    cfg.salesTaxRate && cfg.salesTaxRate > 0
      ? Math.round(subtotal * cfg.salesTaxRate * 100) / 100
      : 0;
  const taxedTotal = subtotal + tax;
  const fee = cfg.passStripeFeesToCustomer
    ? Math.round((taxedTotal * 0.029 + 0.3) * 100) / 100
    : 0;
  const total = Math.round((taxedTotal + fee) * 100) / 100;
  return { subtotal, tax, fee, total };
}

/** Human-readable cart summary suitable for system-prompt context. */
export function formatCart(draft: OrderDraft): string {
  if (!draft.items.length) return '(cart empty)';
  const lines = draft.items.map((i, idx) => {
    const mods = i.selectedModifiers?.length
      ? ` [${i.selectedModifiers.map((m) => `${m.groupName}: ${m.modifierName}`).join(', ')}]`
      : '';
    const notes = i.notes ? ` — ${i.notes}` : '';
    return `${idx + 1}. ${i.quantity}× ${i.name}${mods}${notes} — $${(i.price * i.quantity).toFixed(2)}`;
  });
  lines.push(`Total: $${computeTotal(draft).toFixed(2)}`);
  if (draft.pickupTime) lines.push(`Pickup: ${draft.pickupTime}`);
  if (draft.notes) lines.push(`Notes: ${draft.notes}`);
  return lines.join('\n');
}
