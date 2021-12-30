import { expect } from 'chai';
import { Tag } from '../types';
import { getSavedItemMapFromTags, validatePagination } from './utils';
import { validate } from 'graphql';

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

describe('pagination validation', () => {
  it('should throw error if first and last are set', () => {
    const pagination = { first: 100, last: 20 };
    expect(() => validatePagination(pagination)).throw(
      'Please set either {after and first} or {before and last}'
    );
  });

  it('should throw error if before and after are set', () => {
    const pagination = { before: 'b_cursor', after: 'a_cursor' };
    expect(() => validatePagination(pagination)).throw(
      'Please set either {after and first} or {before and last}'
    );
  });

  it('should throw error when cursor is negative number', () => {
    const before =  Buffer.from('-1').toString('base64');
    const pagination = { before: before, last: 10 };
    expect(() => validatePagination(pagination)).throw(
      'invalid before cursor'
    );
  });

  it('set default pagination size if no size is given', () => {
    const before =  Buffer.from('10').toString('base64');
    const actual = validatePagination({before: before});
    expect(actual).to.deep.equal({before: before, last: 30});
  });

  it('set first to default pagination size if input is negative', () => {
    const after =  Buffer.from('10').toString('base64');
    const actual = validatePagination({after: after, first: -20 });
    expect(actual).to.deep.equal({after: after, first: 30});
  });
});
