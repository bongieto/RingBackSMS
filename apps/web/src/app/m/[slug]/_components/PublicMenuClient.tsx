'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Phone, Plus, Minus, ChevronDown, ChevronUp } from 'lucide-react';

interface ModifierOption {
  id: string;
  name: string;
  priceAdjust: number;
  isDefault: boolean;
}

interface ModifierGroup {
  id: string;
  name: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  required: boolean;
  minSelections: number;
  maxSelections: number;
  modifiers: ModifierOption[];
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  imageUrl: string | null;
  duration: number | null;
  modifierGroups: ModifierGroup[];
}

interface Props {
  tenantName: string;
  phoneNumber: string | null;
  items: MenuItem[];
  brandColor?: string | null;
  brandLogoUrl?: string | null;
  hidePoweredBy?: boolean;
}

/**
 * Interactive public menu. Customers tap +/- to build a cart client-side,
 * then tap "Text order" — which opens their SMS app with a prefilled body
 * like "Order: 2 Kanto Fries (Spicy), 1 Pancit (Shrimp)". The tenant's AI
 * agent receives that text and parses it with its normal order flow.
 *
 * Items without modifier groups use simple +/- buttons. Items with groups
 * use an inline expand-to-configure UI: pick modifiers, then tap "Add" to
 * commit a single line with that configuration. v1 supports one
 * configuration per item — tapping the expanded item again overwrites the
 * selection. If a customer wants two configurations, they can text the
 * business directly.
 */
export function PublicMenuClient({ tenantName, phoneNumber, items, brandColor, brandLogoUrl, hidePoweredBy }: Props) {
  const brandStyle = brandColor
    ? ({ '--brand': brandColor } as React.CSSProperties)
    : undefined;
  const brandBg = brandColor ? { backgroundColor: brandColor } : undefined;
  interface CartLine {
    quantity: number;
    selectedModifiers: Array<{ groupId: string; modifierId: string }>;
  }
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Draft modifier selection while a modifier-bearing item is expanded but
  // not yet added. Once the customer taps "Add" we copy this into `cart`.
  const [drafts, setDrafts] = useState<Record<string, { groupId: string; modifierId: string }[]>>({});

  function toggleExpanded(item: MenuItem) {
    setExpanded((prev) => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];
      } else {
        next[item.id] = true;
        // Seed draft with defaults + any already-saved selections
        setDrafts((d) => ({
          ...d,
          [item.id]: cart[item.id]?.selectedModifiers
            ?? item.modifierGroups.flatMap((g) =>
              g.required && g.selectionType === 'SINGLE'
                ? [{ groupId: g.id, modifierId: (g.modifiers.find((m) => m.isDefault) ?? g.modifiers[0])?.id }].filter((x) => !!x.modifierId) as { groupId: string; modifierId: string }[]
                : [],
            ),
        }));
      }
      return next;
    });
  }

  function setDraftSingle(itemId: string, groupId: string, modifierId: string) {
    setDrafts((d) => {
      const existing = (d[itemId] ?? []).filter((sel) => sel.groupId !== groupId);
      return { ...d, [itemId]: [...existing, { groupId, modifierId }] };
    });
  }

  function toggleDraftMultiple(itemId: string, groupId: string, modifierId: string, max: number) {
    setDrafts((d) => {
      const arr = d[itemId] ?? [];
      const alreadyPicked = arr.some((x) => x.groupId === groupId && x.modifierId === modifierId);
      if (alreadyPicked) {
        return { ...d, [itemId]: arr.filter((x) => !(x.groupId === groupId && x.modifierId === modifierId)) };
      }
      const countForGroup = arr.filter((x) => x.groupId === groupId).length;
      if (countForGroup >= max) return d;
      return { ...d, [itemId]: [...arr, { groupId, modifierId }] };
    });
  }

  function addConfiguredItem(item: MenuItem) {
    const selections = drafts[item.id] ?? [];
    // Validate: every required group must have at least minSelections.
    for (const g of item.modifierGroups) {
      const count = selections.filter((s) => s.groupId === g.id).length;
      if (g.required && count < Math.max(1, g.minSelections)) return; // silently block
    }
    setCart((prev) => {
      const existing = prev[item.id];
      return {
        ...prev,
        [item.id]: {
          quantity: existing ? existing.quantity : 1,
          selectedModifiers: selections,
        },
      };
    });
    setExpanded((e) => {
      const next = { ...e };
      delete next[item.id];
      return next;
    });
  }

  const inc = (item: MenuItem) => {
    if (item.modifierGroups.length > 0 && !cart[item.id]) {
      toggleExpanded(item);
      return;
    }
    setCart((prev) => ({
      ...prev,
      [item.id]: {
        quantity: (prev[item.id]?.quantity ?? 0) + 1,
        selectedModifiers: prev[item.id]?.selectedModifiers ?? [],
      },
    }));
  };

  const dec = (id: string) =>
    setCart((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const { [id]: _removed, ...rest } = prev;
        void _removed;
        return rest;
      }
      return { ...prev, [id]: { ...existing, quantity: existing.quantity - 1 } };
    });

  const cartLines = useMemo(
    () =>
      items
        .map((item) => ({ item, line: cart[item.id] }))
        .filter((r): r is { item: MenuItem; line: CartLine } => !!r.line && r.line.quantity > 0)
        .map((r) => {
          const modPriceAdj = r.line.selectedModifiers.reduce((sum, sel) => {
            const group = r.item.modifierGroups.find((g) => g.id === sel.groupId);
            const mod = group?.modifiers.find((m) => m.id === sel.modifierId);
            return sum + (mod?.priceAdjust ?? 0);
          }, 0);
          const modNames = r.line.selectedModifiers
            .map((sel) => {
              const group = r.item.modifierGroups.find((g) => g.id === sel.groupId);
              const mod = group?.modifiers.find((m) => m.id === sel.modifierId);
              return mod?.name;
            })
            .filter(Boolean) as string[];
          return {
            item: r.item,
            quantity: r.line.quantity,
            unitPrice: r.item.price + modPriceAdj,
            modNames,
          };
        }),
    [items, cart],
  );

  const totalQty = cartLines.reduce((s, r) => s + r.quantity, 0);
  const totalPrice = cartLines.reduce((s, r) => s + r.unitPrice * r.quantity, 0);

  // Compose the SMS body. Modifiers are appended in parentheses so the
  // agent's `add_items` tool parses them as modifier selections. Format:
  // "Order: 2 Kanto Fries (Spicy), 1 Pancit (Shrimp, Extra veggies)"
  const smsBody = useMemo(() => {
    if (cartLines.length === 0) return 'ORDER';
    const parts = cartLines.map((r) => {
      const mods = r.modNames.length ? ` (${r.modNames.join(', ')})` : '';
      return `${r.quantity} ${r.item.name}${mods}`;
    });
    let body = `Order: ${parts.join(', ')}`;
    if (body.length > 400) body = body.slice(0, 397) + '…';
    return body;
  }, [cartLines]);

  const smsHref = phoneNumber
    ? `sms:${phoneNumber}?&body=${encodeURIComponent(smsBody)}`
    : null;

  const categories = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of items) {
      const cat = item.category || 'Menu';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return Array.from(map.entries()).map(([category, items]) => ({
      category,
      items,
    }));
  }, [items]);

  const hasMenu = items.length > 0;

  return (
    <div className="min-h-screen bg-slate-50" style={brandStyle}>
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3">
            {brandLogoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={brandLogoUrl} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900 truncate">{tenantName}</h1>
              <p className="text-xs text-muted-foreground">Text to order</p>
            </div>
          </div>
          {phoneNumber && (
            <a
              href={`tel:${phoneNumber}`}
              className="shrink-0 inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              <Phone className="h-4 w-4" />
              Call
            </a>
          )}
        </div>
      </header>

      {/* Menu */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-36">
        {!hasMenu ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">Our menu is being updated.</p>
            <p className="text-sm mt-2">Text us to place an order.</p>
          </div>
        ) : (
          categories.map((group) => (
            <section key={group.category} className="mb-8">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3 px-1">
                {group.category}
              </h2>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {group.items.map((item) => {
                  const line = cart[item.id];
                  const count = line?.quantity ?? 0;
                  const hasMods = item.modifierGroups.length > 0;
                  const isExpanded = !!expanded[item.id];
                  const draft = drafts[item.id] ?? [];

                  // Required-group validation blocks "Add".
                  const requiredUnmet = item.modifierGroups.some((g) => {
                    if (!g.required) return false;
                    const picked = draft.filter((s) => s.groupId === g.id).length;
                    return picked < Math.max(1, g.minSelections);
                  });

                  return (
                    <div key={item.id}>
                      <div className="p-4 flex gap-3">
                        {item.imageUrl && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="h-16 w-16 rounded-lg object-cover shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-slate-900">{item.name}</h3>
                            <span className="font-mono font-semibold text-slate-900 shrink-0">
                              ${item.price.toFixed(2)}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {item.description}
                            </p>
                          )}
                          {count > 0 && line.selectedModifiers.length > 0 && (
                            <p className="text-xs text-blue-700 mt-1">
                              {line.selectedModifiers
                                .map((sel) => {
                                  const g = item.modifierGroups.find((gg) => gg.id === sel.groupId);
                                  const m = g?.modifiers.find((mm) => mm.id === sel.modifierId);
                                  return m?.name;
                                })
                                .filter(Boolean)
                                .join(', ')}
                              {' · '}
                              <button
                                className="underline"
                                onClick={() => toggleExpanded(item)}
                              >
                                Edit
                              </button>
                            </p>
                          )}
                          {hasMods && count === 0 && !isExpanded && (
                            <button
                              className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                              onClick={() => toggleExpanded(item)}
                            >
                              Customize <ChevronDown className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        {/* Quantity control */}
                        <div className="shrink-0 self-center">
                          {count === 0 ? (
                            <button
                              type="button"
                              onClick={() => inc(item)}
                              className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 active:scale-95 transition-transform"
                              aria-label={`Add ${item.name}`}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          ) : (
                            <div className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full p-0.5">
                              <button
                                type="button"
                                onClick={() => dec(item.id)}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-blue-100 active:scale-95 transition-transform text-blue-700"
                                aria-label={`Remove one ${item.name}`}
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="min-w-[1.5rem] text-center text-sm font-semibold text-blue-700">
                                {count}
                              </span>
                              <button
                                type="button"
                                onClick={() => inc(item)}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-blue-100 active:scale-95 transition-transform text-blue-700"
                                aria-label={`Add another ${item.name}`}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Modifier picker (inline expand) */}
                      {isExpanded && (
                        <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 space-y-3">
                          {item.modifierGroups.map((g) => (
                            <div key={g.id}>
                              <div className="flex items-baseline justify-between mb-1.5">
                                <div className="text-sm font-medium text-slate-800">
                                  {g.name}
                                  {g.required && <span className="text-red-500 ml-0.5">*</span>}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {g.selectionType === 'SINGLE'
                                    ? 'Pick one'
                                    : `Pick up to ${g.maxSelections}`}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {g.modifiers.map((m) => {
                                  const picked = draft.some(
                                    (s) => s.groupId === g.id && s.modifierId === m.id,
                                  );
                                  return (
                                    <button
                                      key={m.id}
                                      onClick={() => {
                                        if (g.selectionType === 'SINGLE') {
                                          setDraftSingle(item.id, g.id, m.id);
                                        } else {
                                          toggleDraftMultiple(item.id, g.id, m.id, g.maxSelections);
                                        }
                                      }}
                                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
                                        picked
                                          ? 'bg-blue-600 text-white border border-blue-600'
                                          : 'bg-white text-slate-700 border border-slate-300 hover:border-slate-400'
                                      }`}
                                    >
                                      {m.name}
                                      {m.priceAdjust > 0 && (
                                        <span className={picked ? 'opacity-80' : 'text-slate-500'}>
                                          +${m.priceAdjust.toFixed(2)}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => toggleExpanded(item)}
                              className="flex-1 rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700"
                            >
                              Cancel
                            </button>
                            <button
                              disabled={requiredUnmet}
                              onClick={() => addConfiguredItem(item)}
                              className="flex-1 rounded-lg bg-blue-600 disabled:opacity-50 py-2 text-sm font-semibold text-white"
                            >
                              {count > 0 ? 'Update' : 'Add to order'}
                            </button>
                          </div>
                          {requiredUnmet && (
                            <p className="text-[11px] text-red-600">
                              Please pick required options to continue.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>

      {/* Sticky CTA */}
      {smsHref && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-white border-t shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          {totalQty > 0 && (
            <div className="max-w-2xl mx-auto px-4 pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {totalQty} item{totalQty === 1 ? '' : 's'} selected
                </span>
                <span className="font-mono font-semibold">${totalPrice.toFixed(2)}</span>
              </div>
            </div>
          )}
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <a
              href={smsHref}
              style={brandBg}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 active:scale-95 transition-transform shadow-lg shadow-blue-600/25"
            >
              <MessageSquare className="h-5 w-5" />
              {totalQty > 0 ? `Text order (${totalQty})` : 'Text to order'}
            </a>
          </div>
          {!hidePoweredBy && (
            <p className="text-center text-[10px] text-slate-400 pb-2 px-4">
              Powered by <Link href="/" className="hover:underline">RingBackSMS</Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
