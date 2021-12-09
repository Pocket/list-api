import chai, { expect } from 'chai';
import { TagMutationService } from '../mutationServices';
import { TagCreateInput } from '../../types';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
chai.use(deepEqualInAnyOrder);

describe('deduplicateInput', () => {
  it('should remove duplicates', () => {
    const inputData: TagCreateInput[] = [
      { name: 'foam', savedItemId: '1' },
      { name: 'foam', savedItemId: '1' },
      { name: 'roller', savedItemId: '2' },
    ];
    const deduplicated = TagMutationService.deduplicateTagInput(inputData);
    expect(deduplicated.length).to.equal(2);
    expect(deduplicated).to.deep.equalInAnyOrder(inputData.slice(1));
  });
  it('should keep values that differ by only 1 key/value', () => {
    const inputData: TagCreateInput[] = [
      { name: 'foam', savedItemId: '1' },
      { name: 'foamy', savedItemId: '1' },
    ];
    const deduplicated = TagMutationService.deduplicateTagInput(inputData);
    expect(deduplicated.length).to.equal(2);
    expect(deduplicated).to.deep.equalInAnyOrder(inputData);
  });
});
