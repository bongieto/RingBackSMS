import { prisma } from '../db';
import { NotFoundError } from '../errors';

// ── Option groups ────────────────────────────────────────────────────────────

export async function listOptionGroups(tenantId: string) {
  const groups = await prisma.menuItemModifierGroup.findMany({
    where: { menuItem: { tenantId } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      menuItem: { select: { id: true, name: true, tenantId: true } },
      modifiers: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { modifiers: true } },
    },
  });
  return groups.map((g) => ({
    id: g.id,
    menuItemId: g.menuItemId,
    menuItemName: g.menuItem.name,
    name: g.name,
    selectionType: g.selectionType,
    required: g.required,
    minSelections: g.minSelections,
    maxSelections: g.maxSelections,
    sortOrder: g.sortOrder,
    posGroupId: g.posGroupId,
    optionCount: g._count.modifiers,
    // Inline the modifiers so the dashboard can clone a group's options
    // without a follow-up round-trip. Decimals coerced to numbers to
    // match the rest of our API shapes.
    modifiers: g.modifiers.map((m) => ({
      id: m.id,
      groupId: m.groupId,
      name: m.name,
      priceAdjust: Number(m.priceAdjust),
      isDefault: m.isDefault,
      sortOrder: m.sortOrder,
      posModifierId: m.posModifierId,
    })),
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  }));
}

export async function upsertOptionGroup(
  tenantId: string,
  input: {
    id?: string;
    menuItemId: string;
    name: string;
    selectionType?: 'SINGLE' | 'MULTIPLE' | 'QUANTITY' | 'PIZZA' | 'MIXED';
    required?: boolean;
    minSelections?: number;
    maxSelections?: number;
    sortOrder?: number;
  },
) {
  // Verify the parent MenuItem belongs to this tenant
  const item = await prisma.menuItem.findUnique({
    where: { id: input.menuItemId },
    select: { tenantId: true },
  });
  if (!item || item.tenantId !== tenantId) throw new NotFoundError('Menu item');

  if (input.id) {
    const existing = await prisma.menuItemModifierGroup.findUnique({
      where: { id: input.id },
      select: { menuItem: { select: { tenantId: true } } },
    });
    if (!existing || existing.menuItem.tenantId !== tenantId)
      throw new NotFoundError('Option group');
    return prisma.menuItemModifierGroup.update({
      where: { id: input.id },
      data: {
        name: input.name,
        selectionType: input.selectionType,
        required: input.required,
        minSelections: input.minSelections,
        maxSelections: input.maxSelections,
        sortOrder: input.sortOrder,
      },
    });
  }

  return prisma.menuItemModifierGroup.create({
    data: {
      menuItemId: input.menuItemId,
      name: input.name,
      selectionType: input.selectionType ?? 'SINGLE',
      required: input.required ?? false,
      minSelections: input.minSelections ?? 0,
      maxSelections: input.maxSelections ?? 1,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function deleteOptionGroup(tenantId: string, id: string) {
  const existing = await prisma.menuItemModifierGroup.findUnique({
    where: { id },
    select: { menuItem: { select: { tenantId: true } } },
  });
  if (!existing || existing.menuItem.tenantId !== tenantId)
    throw new NotFoundError('Option group');
  // onDelete: Cascade on MenuItemModifier.groupId handles cleanup.
  await prisma.menuItemModifierGroup.delete({ where: { id } });
}

// ── Options (modifiers within a group) ───────────────────────────────────────

export async function listOptions(tenantId: string) {
  const opts = await prisma.menuItemModifier.findMany({
    where: { group: { menuItem: { tenantId } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      group: { select: { id: true, name: true } },
    },
  });
  return opts.map((o) => ({
    id: o.id,
    groupId: o.groupId,
    groupName: o.group.name,
    name: o.name,
    priceAdjust: Number(o.priceAdjust),
    isDefault: o.isDefault,
    sortOrder: o.sortOrder,
    posModifierId: o.posModifierId,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }));
}

export async function upsertOption(
  tenantId: string,
  input: {
    id?: string;
    groupId: string;
    name: string;
    priceAdjust?: number;
    isDefault?: boolean;
    sortOrder?: number;
  },
) {
  // Verify the group's parent item belongs to this tenant
  const group = await prisma.menuItemModifierGroup.findUnique({
    where: { id: input.groupId },
    select: { menuItem: { select: { tenantId: true } } },
  });
  if (!group || group.menuItem.tenantId !== tenantId)
    throw new NotFoundError('Option group');

  if (input.id) {
    const existing = await prisma.menuItemModifier.findUnique({
      where: { id: input.id },
      select: { group: { select: { menuItem: { select: { tenantId: true } } } } },
    });
    if (!existing || existing.group.menuItem.tenantId !== tenantId)
      throw new NotFoundError('Option');
    return prisma.menuItemModifier.update({
      where: { id: input.id },
      data: {
        name: input.name,
        priceAdjust: input.priceAdjust,
        isDefault: input.isDefault,
        sortOrder: input.sortOrder,
      },
    });
  }

  return prisma.menuItemModifier.create({
    data: {
      groupId: input.groupId,
      name: input.name,
      priceAdjust: input.priceAdjust ?? 0,
      isDefault: input.isDefault ?? false,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function deleteOption(tenantId: string, id: string) {
  const existing = await prisma.menuItemModifier.findUnique({
    where: { id },
    select: { group: { select: { menuItem: { select: { tenantId: true } } } } },
  });
  if (!existing || existing.group.menuItem.tenantId !== tenantId)
    throw new NotFoundError('Option');
  await prisma.menuItemModifier.delete({ where: { id } });
}
