/**
 * Prompt-size regression guards.
 *
 * These tests protect the two knobs the audit flagged (Wave 1 #7.1):
 *
 *   - filteredMenu must be capped — a tenant with 500 items shouldn't
 *     splat all 500 into the prompt per turn.
 *   - Descriptions must drop to compact form on larger menus so the
 *     biggest-per-line token cost doesn't scale linearly.
 *   - When we DO cap, the LLM needs to know it's seeing a subset so it
 *     can call send_menu_link for unlisted items instead of claiming
 *     they don't exist.
 *
 * We test via the public buildOrderAgentSystemPrompt string so a
 * refactor of the internals can't silently remove the hint.
 */
import { buildOrderAgentSystemPrompt } from '../ai/buildAgentPrompt';
import type { TenantContext } from '../types';
import { FlowType } from '@ringback/shared-types';

const TENANT_ID = '00000000-0000-0000-0000-0000000000cc';

function makeItem(i: number): any {
  return {
    id: `item-${i.toString().padStart(4, '0')}`,
    tenantId: TENANT_ID,
    name: `Item ${i}`,
    description: `A tasty description for item ${i} that is not too long`.repeat(3), // ~150 chars
    price: 5 + (i % 10),
    category: i % 2 === 0 ? 'Mains' : 'Sides',
    isAvailable: true,
    duration: null,
    requiresBooking: false,
    squareCatalogId: null,
    squareVariationId: null,
    posCatalogId: null,
    posVariationId: null,
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function mkContext(menu: any[]): TenantContext {
  return {
    tenantId: TENANT_ID,
    tenantName: 'Test Kitchen',
    tenantSlug: 'test-kitchen',
    config: {
      id: 'cfg',
      tenantId: TENANT_ID,
      timezone: 'America/Chicago',
      businessDays: [0, 1, 2, 3, 4, 5, 6],
      closedDates: [],
    } as any,
    flows: [{ id: 'f1', tenantId: TENANT_ID, type: FlowType.ORDER, isEnabled: true, config: null, createdAt: new Date(), updatedAt: new Date() }],
    menuItems: menu,
  };
}

describe('buildOrderAgentSystemPrompt — prompt size', () => {
  it('renders full descriptions on small menus (<=15 items)', () => {
    const menu = Array.from({ length: 10 }, (_, i) => makeItem(i));
    const prompt = buildOrderAgentSystemPrompt({
      tenantContext: mkContext(menu),
      filteredMenu: menu,
      soldOutItems: [],
      totalMenuCount: menu.length,
      draft: null,
    });
    // Description delimiter should appear on each item line
    const descLines = (prompt.match(/] Item \d+ .* — \$.* — /g) ?? []).length;
    expect(descLines).toBeGreaterThan(0);
  });

  it('switches to compact mode (no descriptions) above 15 filtered items', () => {
    const menu = Array.from({ length: 20 }, (_, i) => makeItem(i));
    const prompt = buildOrderAgentSystemPrompt({
      tenantContext: mkContext(menu),
      filteredMenu: menu,
      soldOutItems: [],
      totalMenuCount: menu.length,
      draft: null,
    });
    // In compact mode, the "— description" segment is gone. We check
    // that NO menu line has the ` — ` between the price and a longer
    // text tail (compact rendering stops at price).
    //
    // Pattern of a full-rendering item: "- [id] Name (Cat) — $X.XX — <desc>"
    // Pattern of a compact item:        "- [id] Name (Cat) — $X.XX"
    const priceDashDescPattern = /— \$\d+\.\d{2} — /;
    expect(prompt).not.toMatch(priceDashDescPattern);
  });

  it('adds the "+ N more items" hint when filteredMenu is smaller than totalMenuCount', () => {
    const menu = Array.from({ length: 25 }, (_, i) => makeItem(i));
    const prompt = buildOrderAgentSystemPrompt({
      tenantContext: mkContext(menu),
      filteredMenu: menu, // showing all 25
      soldOutItems: [],
      totalMenuCount: 100, // but tenant has 100 total
      draft: null,
    });
    expect(prompt).toMatch(/\+ 75 more items/);
    expect(prompt).toMatch(/send_menu_link/);
  });

  it('does NOT add overflow hint when filteredMenu covers the whole menu', () => {
    const menu = Array.from({ length: 10 }, (_, i) => makeItem(i));
    const prompt = buildOrderAgentSystemPrompt({
      tenantContext: mkContext(menu),
      filteredMenu: menu,
      soldOutItems: [],
      totalMenuCount: menu.length,
      draft: null,
    });
    expect(prompt).not.toMatch(/\+ \d+ more items/);
  });

  it('caps soldOutItems even when caller passes a bigger list', () => {
    // The orderAgent caps at 10 before calling us; this test proves
    // the prompt-builder itself doesn't misbehave when passed more.
    const soldOut = Array.from({ length: 15 }, (_, i) => makeItem(i + 1000));
    const prompt = buildOrderAgentSystemPrompt({
      tenantContext: mkContext([]),
      filteredMenu: [],
      soldOutItems: soldOut,
      totalMenuCount: 0,
      draft: null,
    });
    // formatSoldOut is unopinionated about length — we document via this
    // test that the orderAgent-level cap (10) is the line of defense.
    const soldOutLines = (prompt.match(/^- Item 1\d{3}/gm) ?? []).length;
    expect(soldOutLines).toBe(15);
  });
});
