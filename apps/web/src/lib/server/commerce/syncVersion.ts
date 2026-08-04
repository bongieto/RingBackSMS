import { createHash } from 'node:crypto';

export type SyncCursor = { sequence: number; checksum: string };

type MenuResourceMapping = {
  resourceType: string;
  externalId: string;
  internalId: string;
};

type MenuIdentitySnapshot = {
  categories: Array<{ externalId: string }>;
  items: Array<{
    externalId: string;
    modifierGroups: Array<{
      externalId: string;
      options: Array<{ externalId: string }>;
    }>;
  }>;
};

function containsDuplicate(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

export function hasDuplicateMenuExternalIds(snapshot: MenuIdentitySnapshot): boolean {
  if (containsDuplicate(snapshot.categories.map((category) => category.externalId))) return true;
  if (containsDuplicate(snapshot.items.map((item) => item.externalId))) return true;
  return snapshot.items.some(
    (item) =>
      containsDuplicate(item.modifierGroups.map((group) => group.externalId)) ||
      item.modifierGroups.some((group) =>
        containsDuplicate(group.options.map((option) => option.externalId))
      )
  );
}

export function decideSnapshot(
  cursor: SyncCursor | null,
  incoming: SyncCursor
): 'apply' | 'idempotent' | 'stale' | 'conflict' {
  if (!cursor || incoming.sequence > cursor.sequence) return 'apply';
  if (incoming.sequence < cursor.sequence) return 'stale';
  return incoming.checksum === cursor.checksum ? 'idempotent' : 'conflict';
}

export function deterministicIntegrationUuid(seed: string): string {
  const chars = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  chars[12] = '5';
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isDeterministicIntegrationMenu(
  connectionId: string,
  mappings: MenuResourceMapping[],
  tenantCategoryCount: number,
  tenantItemCount: number
): boolean {
  if (mappings.length === 0) return tenantCategoryCount === 0 && tenantItemCount === 0;
  if (
    tenantCategoryCount !==
      mappings.filter((mapping) => mapping.resourceType === 'menu_category').length ||
    tenantItemCount !== mappings.filter((mapping) => mapping.resourceType === 'menu_item').length
  ) {
    return false;
  }
  return mappings.every((mapping) => {
    const resource = mapping.resourceType === 'menu_category' ? 'menu-category' : 'menu-item';
    return (
      mapping.internalId ===
      deterministicIntegrationUuid(`${connectionId}:${resource}:${mapping.externalId}`)
    );
  });
}
