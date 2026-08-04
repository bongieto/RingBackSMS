import {
  getBusinessLimitDefinitions,
  getDefaultBusinessLimits,
  type BusinessLimits,
  type TenantConfig,
} from '@ringback/shared-types';

export function getBusinessLimits(
  config: TenantConfig,
  businessType?: string | null,
): BusinessLimits {
  const raw = (config as { businessLimits?: Partial<BusinessLimits> | null }).businessLimits ?? {};
  return {
    ...getDefaultBusinessLimits(businessType),
    ...raw,
    notes: Array.isArray(raw.notes)
      ? raw.notes.filter((note): note is string => typeof note === 'string' && note.trim().length > 0)
      : [],
  };
}

export function formatBusinessLimits(
  config: TenantConfig,
  businessType?: string | null,
): string {
  const limits = getBusinessLimits(config, businessType);
  const lines: string[] = [];

  for (const definition of getBusinessLimitDefinitions(businessType)) {
    if (limits[definition.key]) lines.push(`- ${definition.promptRule}`);
  }
  for (const note of limits.notes) lines.push(`- ${note.trim()}`);

  return lines.length
    ? `\n# Business limits (hard rules — database/config beats custom instructions)\n${lines.join('\n')}\n`
    : '';
}
