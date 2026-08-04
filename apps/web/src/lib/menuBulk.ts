export function validSelectedIds(
  selected: ReadonlySet<string>,
  available: ReadonlyArray<{ id: string }>
): string[] {
  const availableIds = new Set(available.map((entry) => entry.id));
  return [...selected].filter((id) => availableIds.has(id));
}

export function menuMutationError(error: unknown, fallback: string): string {
  const responseError = (error as { response?: { data?: { error?: unknown } } })?.response?.data
    ?.error;
  return typeof responseError === 'string' && responseError.trim() ? responseError : fallback;
}
