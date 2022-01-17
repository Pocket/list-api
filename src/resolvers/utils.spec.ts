import { expect } from 'chai';
import { Tag } from '../types';
import { getSavedItemMapFromTags } from './utils';

describe('getSavedItemMapFromTags', () => {
  it('should return a savedItem map from a list of tags', () => {
    const tagA: Tag = { id: 'id1', name: 'tagA', savedItems: ['1', '2'] };
    const tagB: Tag = { id: 'id2', name: 'tagB', savedItems: ['1', '3'] };
    const input: Tag[] = [tagA, tagB];

    const expected = { '1': [tagA, tagB], '2': [tagA], '3': [tagB] };
    const actual = getSavedItemMapFromTags(input);
    expect(actual).to.deep.equal(expected);
  });
});
