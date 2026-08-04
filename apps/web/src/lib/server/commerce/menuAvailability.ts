type ItemAvailability = {
  isAvailable: boolean;
  locationAvailability?: Array<{ isAvailable: boolean }>;
};

/**
 * A missing location override inherits the tenant-wide availability switch.
 * If every active location has an override, at least one must be available.
 */
export function isAvailableAtAnyActiveLocation(
  item: ItemAvailability,
  activeLocationCount: number
): boolean {
  if (!item.isAvailable) return false;
  if (activeLocationCount === 0) return true;
  const overrides = item.locationAvailability ?? [];
  return (
    overrides.length < activeLocationCount ||
    overrides.some((availability) => availability.isAvailable)
  );
}

export function isAvailableAtLocation(item: ItemAvailability): boolean {
  if (!item.isAvailable) return false;
  return item.locationAvailability?.[0]?.isAvailable ?? true;
}
