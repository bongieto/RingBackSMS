import { BulkAvailabilityRequestSchema } from '@ringback/shared-types';
import { menuMutationError, validSelectedIds } from './menuBulk';

const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';

describe('menu bulk safety', () => {
  it('drops selected ids that are no longer in the current tenant data', () => {
    expect(validSelectedIds(new Set([firstId, secondId]), [{ id: secondId }])).toEqual([secondId]);
  });

  it('rejects duplicate ids before a bulk availability mutation', () => {
    expect(
      BulkAvailabilityRequestSchema.safeParse({ ids: [firstId, firstId], isAvailable: false })
        .success
    ).toBe(false);
  });

  it('surfaces an API error and otherwise uses the fallback', () => {
    expect(
      menuMutationError({ response: { data: { error: 'Refresh and try again.' } } }, 'Failed')
    ).toBe('Refresh and try again.');
    expect(menuMutationError(new Error('network'), 'Failed')).toBe('Failed');
  });
});
