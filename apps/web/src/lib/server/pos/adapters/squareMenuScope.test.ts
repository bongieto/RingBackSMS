import type { CatalogObject } from 'square';
import {
  getSquareItemMenuCategoryId,
  getSquareRootMenus,
  resolveSquareMenuScope,
  SquareMenuScopeError,
} from './squareMenuScope';

const menuCategory = (
  id: string,
  name: string,
  options: {
    root?: boolean;
    rootId?: string;
    parentId?: string;
    channels?: string[];
  } = {},
): CatalogObject => ({
  type: 'CATEGORY',
  id,
  categoryData: {
    name,
    categoryType: 'MENU_CATEGORY',
    isTopLevel: options.root ?? false,
    rootCategory: options.rootId,
    parentCategory: options.parentId ? { id: options.parentId } : undefined,
    channels: options.channels,
  },
});

const regularCategory = (id: string, name: string): CatalogObject => ({
  type: 'CATEGORY',
  id,
  categoryData: { name, categoryType: 'REGULAR_CATEGORY' },
});

const item = (
  id: string,
  categoryIds: string[],
  location?: { presentAtAllLocations: boolean; presentAtLocationIds?: string[] },
): CatalogObject => ({
  type: 'ITEM',
  id,
  presentAtAllLocations: location?.presentAtAllLocations,
  presentAtLocationIds: location?.presentAtLocationIds,
  itemData: {
    name: id,
    categories: categoryIds.map((categoryId) => ({ id: categoryId })),
    variations: [],
  },
});

describe('resolveSquareMenuScope', () => {
  it('lists the restaurant menus available on the configured location channel', () => {
    const categories = [
      menuCategory('menu-a', 'Location A', { root: true, channels: ['channel-a'] }),
      menuCategory('menu-b', 'Location B', { root: true, channels: ['channel-b'] }),
      regularCategory('back-kitchen', 'Back Kitchen'),
    ];

    expect(getSquareRootMenus(categories, 'channel-b').map((menu) => menu.id)).toEqual([
      'menu-b',
    ]);
  });

  it('imports only items assigned to the sole Square restaurant menu', () => {
    const categories = [
      menuCategory('menu', 'Main Menu', { root: true, channels: ['channel-a'] }),
      menuCategory('entrees', 'Entrees', { rootId: 'menu', parentId: 'menu' }),
      regularCategory('back-kitchen', 'Back Kitchen'),
    ];
    const items = [
      item('burger', ['entrees', 'back-kitchen']),
      item('prep-only', ['back-kitchen']),
    ];

    const scope = resolveSquareMenuScope(categories, items, {
      locationId: 'location-a',
      locationChannelId: 'channel-a',
    });

    expect(scope.menu.id).toBe('menu');
    expect(scope.items.map((catalogItem) => catalogItem.id)).toEqual(['burger']);
    expect(getSquareItemMenuCategoryId(scope.items[0], scope)).toBe('entrees');
  });

  it('uses the configured location channel to choose its menu', () => {
    const categories = [
      menuCategory('menu-a', 'Location A', { root: true, channels: ['channel-a'] }),
      menuCategory('menu-b', 'Location B', { root: true, channels: ['channel-b'] }),
      menuCategory('a-items', 'A Items', { rootId: 'menu-a', parentId: 'menu-a' }),
      menuCategory('b-items', 'B Items', { rootId: 'menu-b', parentId: 'menu-b' }),
    ];

    const scope = resolveSquareMenuScope(
      categories,
      [item('a', ['a-items']), item('b', ['b-items'])],
      { locationId: 'location-b', locationChannelId: 'channel-b' },
    );

    expect(scope.menu.id).toBe('menu-b');
    expect(scope.items.map((catalogItem) => catalogItem.id)).toEqual(['b']);
  });

  it('chooses the deepest attached menu category for the flat local category', () => {
    const categories = [
      menuCategory('menu', 'Main Menu', { root: true }),
      // Deliberately return the child before its parent; Square does not
      // guarantee catalog ordering.
      menuCategory('entrees', 'Entrees', { rootId: 'menu', parentId: 'food' }),
      menuCategory('food', 'Food', { rootId: 'menu', parentId: 'menu' }),
    ];
    const nestedItem = item('burger', ['food', 'entrees']);
    const scope = resolveSquareMenuScope(categories, [nestedItem], {
      locationId: 'location-a',
      locationChannelId: null,
    });

    expect(getSquareItemMenuCategoryId(nestedItem, scope)).toBe('entrees');
  });

  it('excludes menu items not present at the configured location', () => {
    const categories = [
      menuCategory('menu', 'Main Menu', { root: true }),
      menuCategory('food', 'Food', { rootId: 'menu', parentId: 'menu' }),
    ];
    const elsewhere = item('elsewhere', ['food'], {
      presentAtAllLocations: false,
      presentAtLocationIds: ['location-b'],
    });

    const scope = resolveSquareMenuScope(categories, [elsewhere], {
      locationId: 'location-a',
      locationChannelId: null,
    });

    expect(scope.items).toEqual([]);
  });

  it('fails closed instead of importing the whole catalog when no menu exists', () => {
    expect(() =>
      resolveSquareMenuScope(
        [regularCategory('back-kitchen', 'Back Kitchen')],
        [item('prep-only', ['back-kitchen'])],
        { locationId: 'location-a', locationChannelId: null },
      ),
    ).toThrow(SquareMenuScopeError);
  });

  it('fails closed when multiple menus are ambiguous', () => {
    expect(() =>
      resolveSquareMenuScope(
        [
          menuCategory('breakfast', 'Breakfast', { root: true }),
          menuCategory('dinner', 'Dinner', { root: true }),
        ],
        [],
        { locationId: 'location-a', locationChannelId: null },
      ),
    ).toThrow('Square has multiple restaurant menus');
  });

  it('imports only the explicitly selected menu when multiple menus are available', () => {
    const categories = [
      menuCategory('house', 'The Lumpia House', { root: true }),
      menuCategory('online', 'The Lumpia House + Truck - Online Menu', { root: true }),
      menuCategory('house-items', 'House Items', { rootId: 'house', parentId: 'house' }),
      menuCategory('online-items', 'Online Items', { rootId: 'online', parentId: 'online' }),
    ];

    const scope = resolveSquareMenuScope(
      categories,
      [item('house-only', ['house-items']), item('online-only', ['online-items'])],
      {
        locationId: 'location-a',
        locationChannelId: null,
        preferredMenuId: 'online',
      },
    );

    expect(scope.menu.id).toBe('online');
    expect(scope.items.map((catalogItem) => catalogItem.id)).toEqual(['online-only']);
  });
});
