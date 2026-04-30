import type { BusinessLimits, TenantConfig } from '@ringback/shared-types';

const DEFAULT_LIMITS: BusinessLimits = {
  noDelivery: false,
  noRefundsBySms: true,
  allergyRequiresHuman: true,
  noSameDayCatering: false,
  noSubstitutions: false,
  noAfterHoursPickup: false,
  notes: [],
};

export function getBusinessLimits(config: TenantConfig): BusinessLimits {
  const raw = (config as { businessLimits?: Partial<BusinessLimits> | null }).businessLimits ?? {};
  return {
    ...DEFAULT_LIMITS,
    ...raw,
    notes: Array.isArray(raw.notes)
      ? raw.notes.filter((note): note is string => typeof note === 'string' && note.trim().length > 0)
      : [],
  };
}

export function formatBusinessLimits(config: TenantConfig): string {
  const limits = getBusinessLimits(config);
  const lines: string[] = [];

  if (limits.noDelivery) lines.push('- Do not offer delivery. Tell customers pickup is available.');
  if (limits.noRefundsBySms) lines.push('- Do not process, promise, or confirm refunds over SMS. Direct refund requests to a human.');
  if (limits.allergyRequiresHuman) lines.push('- Do not confirm allergy safety over SMS. Direct allergy questions to staff.');
  if (limits.noSameDayCatering) lines.push('- Do not offer same-day catering. Ask customers to call or request a future date.');
  if (limits.noSubstitutions) lines.push('- Do not promise substitutions. Say staff will confirm availability.');
  if (limits.noAfterHoursPickup) lines.push('- Do not offer after-hours pickup.');
  for (const note of limits.notes) lines.push(`- ${note.trim()}`);

  return lines.length
    ? `\n# Business limits (hard rules — database/config beats custom instructions)\n${lines.join('\n')}\n`
    : '';
}
