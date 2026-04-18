export interface Modifier {
  id: string;
  groupId: string;
  groupName?: string;
  name: string;
  priceAdjust: number;
  isDefault: boolean;
  sortOrder: number;
  posModifierId?: string | null;
}

export interface ModifierGroup {
  id: string;
  menuItemId: string;
  menuItemName?: string;
  name: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  required: boolean;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
  posGroupId?: string | null;
  optionCount?: number;
  modifiers?: Modifier[];
}

export interface CategoryRef {
  id: string;
  name: string;
  sortOrder: number;
  isAvailable: boolean;
}

export interface MenuCategory extends CategoryRef {
  posCategoryId?: string | null;
  itemCount: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  categoryId: string | null;
  categoryRef?: CategoryRef | null;
  imageUrl?: string | null;
  isAvailable: boolean;
  requiresBooking?: boolean;
  modifierGroups?: ModifierGroup[];
}
