import { mergeOrderedSubset, moveIdToPosition } from './menuOrdering';

describe('moveIdToPosition', () => {
  it('moves an id forward without dropping siblings', () => {
    expect(moveIdToPosition(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves an id backward without duplicating it', () => {
    expect(moveIdToPosition(['a', 'b', 'c', 'd'], 'b', 'd')).toEqual(['a', 'c', 'd', 'b']);
  });
});

describe('mergeOrderedSubset', () => {
  it('reorders visible ids while leaving hidden ids in their slots', () => {
    expect(mergeOrderedSubset(['a', 'b', 'c', 'd'], ['d', 'b'])).toEqual(['a', 'd', 'c', 'b']);
  });

  it('rejects duplicates and unknown ids', () => {
    expect(() => mergeOrderedSubset(['a', 'b'], ['a', 'a'])).toThrow();
    expect(() => mergeOrderedSubset(['a', 'b'], ['c'])).toThrow();
  });
});
