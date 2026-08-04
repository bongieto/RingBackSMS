/** Move one id into another id's current position while preserving every sibling. */
export function moveIdToPosition(ids: string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return ids;
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1) return ids;

  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, draggedId);
  return next;
}

/**
 * Replace the positions occupied by a subset with that subset's new order.
 * This lets filtered dashboard views reorder safely without disturbing hidden
 * records in the same persisted scope.
 */
export function mergeOrderedSubset(currentIds: string[], orderedSubsetIds: string[]): string[] {
  const currentSet = new Set(currentIds);
  const subsetSet = new Set(orderedSubsetIds);

  if (
    subsetSet.size !== orderedSubsetIds.length ||
    orderedSubsetIds.some((id) => !currentSet.has(id))
  ) {
    throw new Error('The reordered ids must be a unique subset of the current ids');
  }

  let subsetIndex = 0;
  return currentIds.map((id) => (subsetSet.has(id) ? orderedSubsetIds[subsetIndex++] : id));
}
