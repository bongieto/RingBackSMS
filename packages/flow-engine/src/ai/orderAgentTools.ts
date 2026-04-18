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

// ── Tool execution result ─────────────────────────────────────────────────────

export type ToolResult =
  | { ok: true; kind: 'mutated'; message?: string }
  | { ok: true; kind: 'confirm' }
  | { ok: true; kind: 'cancel' }
  | { ok: true; kind: 'menu_link' }
  | { ok: true; kind: 'clarification'; question: string; field: string }
  | { ok: false; error: string };

// ── Handlers: operate on a cloned OrderDraft ──────────────────────────────────

function findMenuItem(menu: MenuItem[], id: string): MenuItem | undefined {
  return menu.find((m) => m.id === id && m.isAvailable !== false);
}

/** Resolve modifier group+name pairs against the menu item's modifierGroups,
 *  returning the SelectedModifier array we persist in the cart. */
function resolveModifiers(
  item: MenuItem,
  raw: Array<{ group_name: string; modifier_name: string }>,
): { ok: true; mods: SelectedModifier[] } | { ok: false; error: string } {
  const mods: SelectedModifier[] = [];
  for (const r of raw) {
    const group = item.modifierGroups?.find(
      (g) => g.name.toLowerCase() === r.group_name.toLowerCase(),
    );
    if (!group) {
      return { ok: false, error: `"${item.name}" has no "${r.group_name}" option` };
    }
    const mod = group.modifiers.find(
      (m) => m.name.toLowerCase() === r.modifier_name.toLowerCase(),
    );
    if (!mod) {
      return {
        ok: false,
        error: `"${r.modifier_name}" isn't a valid ${group.name} for ${item.name}`,
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
): ToolResult {
  const parsed = AddItemsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid add_items input' };

  for (const req of parsed.data.items) {
    const menuItem = findMenuItem(menu, req.menu_item_id);
    if (!menuItem) {
      return {
        ok: false,
        error: `menu_item_id "${req.menu_item_id}" not found or unavailable`,
      };
    }
    let selectedModifiers: SelectedModifier[] | undefined;
    if (req.modifiers && req.modifiers.length > 0) {
      const r = resolveModifiers(menuItem, req.modifiers);
      if (!r.ok) return r;
      selectedModifiers = r.mods;
    }

    // Consolidate: if a line for this exact menu_item + modifiers + notes
    // already exists, bump its quantity instead of pushing a duplicate line.
    const existing = draft.items.find(
      (line) =>
        line.menuItemId === menuItem.id &&
        (line.notes ?? '') === (req.notes ?? '') &&
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
      });
    }
  }
  return { ok: true, kind: 'mutated' };
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
