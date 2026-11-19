import { buildPosPushAlert, splitOrderItemsForPos, type MenuLinkRow } from './orderItems';

const linked: MenuLinkRow = {
  id: 'linked-1',
  name: 'Pork Sisig',
  price: 15.99,
  posVariationId: 'VAR_PORK',
  squareVariationId: 'VAR_PORK',
};
const orphan: MenuLinkRow = {
  id: 'orphan-1',
  name: 'Vegan Tofu Sisig',
  price: 18.99,
  posVariationId: null,
  squareVariationId: null,
};

describe('splitOrderItemsForPos', () => {
  it('sends linked items by variation id', () => {
    const out = splitOrderItemsForPos(
      [{ menuItemId: 'linked-1', name: 'Pork Sisig', price: 15.99, quantity: 2 }],
      [linked],
      { supportsCustomLineItems: true },
    );
    expect(out.linked).toEqual([{ externalVariationId: 'VAR_PORK', quantity: 2 }]);
    expect(out.custom).toEqual([]);
    expect(out.dropped).toEqual([]);
  });

  it('falls back to squareVariationId when posVariationId is empty', () => {
    const out = splitOrderItemsForPos(
      [{ menuItemId: 'linked-1', quantity: 1 }],
      [{ ...linked, posVariationId: null, squareVariationId: 'VAR_LEGACY' }],
      { supportsCustomLineItems: false },
    );
    expect(out.linked).toEqual([{ externalVariationId: 'VAR_LEGACY', quantity: 1 }]);
  });

  // The 2026-11-19 incident: an order whose only item was never linked to
  // Square was skipped entirely, so nothing printed.
  it('sends an unlinked item as a custom line when the adapter supports it', () => {
    const out = splitOrderItemsForPos(
      [{ menuItemId: 'orphan-1', name: 'Vegan Tofu Sisig', price: 18.99, quantity: 2 }],
      [orphan],
      { supportsCustomLineItems: true },
    );
    expect(out.linked).toEqual([]);
    expect(out.custom).toEqual([{ name: 'Vegan Tofu Sisig', priceCents: 1899, quantity: 2 }]);
    expect(out.dropped).toEqual([]);
  });

  it('drops an unlinked item when the adapter needs a catalog id', () => {
    const out = splitOrderItemsForPos(
      [
        { menuItemId: 'linked-1', name: 'Pork Sisig', price: 15.99, quantity: 1 },
        { menuItemId: 'orphan-1', name: 'Vegan Tofu Sisig', price: 18.99, quantity: 2 },
      ],
      [linked, orphan],
      { supportsCustomLineItems: false },
    );
    expect(out.linked).toHaveLength(1);
    expect(out.custom).toEqual([]);
    expect(out.dropped).toEqual([
      {
        menuItemId: 'orphan-1',
        name: 'Vegan Tofu Sisig',
        reason: 'no posVariationId or squareVariationId (orphan item, not linked to POS)',
      },
    ]);
  });

  it('keeps a line whose MenuItem was deleted, using the order line itself', () => {
    const out = splitOrderItemsForPos(
      [{ menuItemId: 'gone', name: 'Old Special', price: '12.50', quantity: 1 }],
      [],
      { supportsCustomLineItems: true },
    );
    expect(out.custom).toEqual([{ name: 'Old Special', priceCents: 1250, quantity: 1 }]);
  });

  it('uses the menu name and price when the order line lacks them', () => {
    const out = splitOrderItemsForPos([{ menuItemId: 'orphan-1', quantity: 1 }], [orphan], {
      supportsCustomLineItems: true,
    });
    expect(out.custom).toEqual([{ name: 'Vegan Tofu Sisig', priceCents: 1899, quantity: 1 }]);
  });

  it('prefers the price charged on the order line over the menu price', () => {
    const out = splitOrderItemsForPos(
      [{ menuItemId: 'orphan-1', name: 'Vegan Tofu Sisig', price: 20.49, quantity: 1 }],
      [orphan],
      { supportsCustomLineItems: true },
    );
    expect(out.custom[0].priceCents).toBe(2049);
  });

  it('drops a line with nothing to build a custom line from', () => {
    const out = splitOrderItemsForPos([{ quantity: 1 }], [], { supportsCustomLineItems: true });
    expect(out.custom).toEqual([]);
    expect(out.dropped).toHaveLength(1);
    expect(out.dropped[0].reason).toContain('no name or price');
  });

  it('rounds prices to whole cents', () => {
    const out = splitOrderItemsForPos(
      [{ name: 'Rounding', price: 0.1 + 0.2, quantity: 1 }],
      [],
      { supportsCustomLineItems: true },
    );
    expect(out.custom[0].priceCents).toBe(30);
  });
});

describe('buildPosPushAlert', () => {
  it('names the unlinked items when nothing was sent', () => {
    const alert = buildPosPushAlert({
      orderNumber: 'ORD-1',
      posName: 'Clover',
      kind: 'not_sent',
      dropped: [
        { menuItemId: 'a', name: 'Laing', reason: 'x' },
        { menuItemId: 'a', name: 'Laing', reason: 'x' },
        { menuItemId: 'b', name: 'Pinoy Vegan Curry', reason: 'x' },
      ],
    });
    expect(alert.subject).toBe('Order ORD-1 was NOT sent to Clover');
    expect(alert.message).toContain('Not linked to Clover: Laing, Pinoy Vegan Curry.');
  });

  it('reports the POS error when the push threw', () => {
    const alert = buildPosPushAlert({
      orderNumber: 'ORD-2',
      posName: 'Square',
      kind: 'not_sent',
      dropped: [],
      errorMessage: 'Tenant not connected to Square',
    });
    expect(alert.message).toContain('Square error: Tenant not connected to Square');
  });

  it('describes a partial push', () => {
    const alert = buildPosPushAlert({
      orderNumber: 'ORD-3',
      posName: 'Toast',
      kind: 'partial',
      dropped: [{ menuItemId: 'a', name: 'Sago at Gulaman', reason: 'x' }],
    });
    expect(alert.subject).toBe('Order ORD-3 reached Toast with items missing');
    expect(alert.message).toContain('Sago at Gulaman');
  });
});
