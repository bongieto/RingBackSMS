import type { CatalogObject } from 'square';

export class SquareMenuScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SquareMenuScopeError';
  }
}

export interface SquareMenuScope {
  menu: CatalogObject;
  menuCategoryIds: Set<string>;
  categoryDepthById: Map<string, number>;
  items: CatalogObject[];
}

export function getSquareRootMenus(
  categories: CatalogObject[],
  locationChannelId: string | null,
): CatalogObject[] {
  const roots = categories.filter((category) => {
    const data = category.categoryData;
    if (data?.categoryType !== 'MENU_CATEGORY') return false;
    return (
      data.isTopLevel === true ||
      (!data.parentCategory?.id && (!data.rootCategory || data.rootCategory === category.id))
    );
  });

  if (!locationChannelId) return roots;
  return roots.filter((root) =>
    root.categoryData?.channels?.includes(locationChannelId),
  );
}

function categoryIdsForItem(item: CatalogObject): string[] {
  if (!item.itemData) return [];

  const categoryIds = (item.itemData.categories ?? [])
    .map((category) => category.id)
    .filter((id): id is string => Boolean(id));

  // Square deprecated categoryId in favor of categories, but older
  // catalogs can still return it. Keep it as a compatibility fallback.
  if (item.itemData.categoryId && !categoryIds.includes(item.itemData.categoryId)) {
    categoryIds.push(item.itemData.categoryId);
  }

  return categoryIds;
}

export function isSquareObjectPresentAtLocation(
  object: CatalogObject,
  locationId: string | null,
): boolean {
  if (!locationId) return true;
  if (object.absentAtLocationIds?.includes(locationId)) return false;
  if (object.presentAtAllLocations === false) {
    return object.presentAtLocationIds?.includes(locationId) ?? false;
  }
  return true;
}

/**
 * Resolve exactly one Square restaurant menu and return only the items that
 * belong to that menu hierarchy. This intentionally never falls back to the
 * full ITEM catalog: an ambiguous or missing menu is safer than importing
 * unrelated retail, archived, kitchen-only, or alternate-menu items.
 */
export function resolveSquareMenuScope(
  categories: CatalogObject[],
  items: CatalogObject[],
  options: {
    locationId: string | null;
    locationChannelId: string | null;
    preferredMenuId?: string | null;
  },
): SquareMenuScope {
  const menuCategories = categories.filter(
    (category) => category.categoryData?.categoryType === 'MENU_CATEGORY',
  );

  let candidates = getSquareRootMenus(categories, options.locationChannelId);

  if (options.preferredMenuId) {
    const preferred = candidates.find((menu) => menu.id === options.preferredMenuId);
    if (!preferred) {
      throw new SquareMenuScopeError(
        'The selected Square menu is not available at the configured location. Choose the correct Square location or menu, then try again.',
      );
    }
    candidates = [preferred];
  }

  if (candidates.length === 0) {
    throw new SquareMenuScopeError(
      'No Square restaurant menu was found for the configured location. Create or assign a menu in Square, then pull from POS again.',
    );
  }

  if (candidates.length > 1) {
    const names = candidates
      .map((menu) => menu.categoryData?.name ?? menu.id)
      .sort()
      .join(', ');
    const nextStep = options.locationChannelId
      ? 'Leave only the intended menu assigned to this location in Square, then try again.'
      : 'Reconnect Square to grant menu-location access, then try again.';
    throw new SquareMenuScopeError(
      `Square has multiple restaurant menus (${names}). ${nextStep}`,
    );
  }

  const menu = candidates[0];
  const menuCategoryIds = new Set<string>([menu.id]);
  const menuCategoryById = new Map(menuCategories.map((category) => [category.id, category]));

  // Square normally supplies rootCategory on every descendant. The iterative
  // parent walk also handles older or partially populated category payloads.
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of menuCategories) {
      if (menuCategoryIds.has(category.id)) continue;
      const data = category.categoryData;
      const parentId = data?.parentCategory?.id;
      const belongsToMenu = data?.rootCategory === menu.id || Boolean(parentId && menuCategoryIds.has(parentId));
      if (!belongsToMenu) continue;

      menuCategoryIds.add(category.id);
      changed = true;
    }
  }

  const categoryDepthById = new Map<string, number>([[menu.id, 0]]);
  const getCategoryDepth = (categoryId: string, visiting = new Set<string>()): number => {
    const cached = categoryDepthById.get(categoryId);
    if (cached !== undefined) return cached;
    if (visiting.has(categoryId)) return 1;

    const nextVisiting = new Set(visiting).add(categoryId);
    const parentId = menuCategoryById.get(categoryId)?.categoryData?.parentCategory?.id;
    const depth =
      parentId && menuCategoryIds.has(parentId)
        ? getCategoryDepth(parentId, nextVisiting) + 1
        : 1;
    categoryDepthById.set(categoryId, depth);
    return depth;
  };
  for (const categoryId of menuCategoryIds) getCategoryDepth(categoryId);

  const scopedItems = items.filter(
    (item) =>
      isSquareObjectPresentAtLocation(item, options.locationId) &&
      categoryIdsForItem(item).some((categoryId) => menuCategoryIds.has(categoryId)),
  );

  return {
    menu,
    menuCategoryIds,
    categoryDepthById,
    items: scopedItems,
  };
}

/** Pick the deepest menu category attached to an item for RingbackSMS's flat category UI. */
export function getSquareItemMenuCategoryId(
  item: CatalogObject,
  scope: Pick<SquareMenuScope, 'menu' | 'menuCategoryIds' | 'categoryDepthById'>,
): string | null {
  return (
    categoryIdsForItem(item)
      .filter((categoryId) => categoryId !== scope.menu.id && scope.menuCategoryIds.has(categoryId))
      .sort(
        (left, right) =>
          (scope.categoryDepthById.get(right) ?? 0) -
          (scope.categoryDepthById.get(left) ?? 0),
      )[0] ?? null
  );
}
