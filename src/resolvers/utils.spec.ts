import { expect } from 'chai';
import { Tag } from '../types';
import { getSavedItemMapFromTags, validatePagination } from './utils';
import config from '../config';

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
  const defaultPageSize = config.pagination.defaultPageSize;
  const maxPageSize = config.pagination.maxPageSize;

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

  it('should throw error if before and first are set', () => {
    const pagination = { before: 'b_cursor', first: 20 };
    expect(() => validatePagination(pagination)).throw(
      'Please set either {after and first} or {before and last}'
    );
  });

  it('should throw error when cursor is negative number', () => {
    const before = Buffer.from('-1').toString('base64');
    const pagination = { before: before, last: 10 };
    expect(() => validatePagination(pagination)).throw('Invalid before cursor');
  });

  it('should set last to default pagination size if before is set', () => {
    const before = Buffer.from('10').toString('base64');
    const actual = validatePagination({ before: before });
    expect(actual).to.deep.equal({ before: before, last: defaultPageSize });
  });

  it('should set last to default pagination size if its negative', () => {
    const before = Buffer.from('10').toString('base64');
    const actual = validatePagination({ before: before, last: -20 });
    expect(actual).to.deep.equal({ before: before, last: defaultPageSize });
  });

  it('should set first to default pagination size if its negative', () => {
    const after = Buffer.from('10').toString('base64');
    const actual = validatePagination({ after: after, first: -20 });
    expect(actual).to.deep.equal({ after: after, first: defaultPageSize });
  });

  it('should set last to default pagination size if its negative', () => {
    const actual = validatePagination({ last: -20 });
    expect(actual).to.deep.equal({ last: defaultPageSize });
  });

  it('should set first if pagination is null', () => {
    const actual = validatePagination(null);
    expect(actual).to.deep.equal({ first: defaultPageSize });
  });

  it('should set first to maxPageSize if its greater than maxPageSize', () => {
    const actual = validatePagination({ first: 200 });
    expect(actual).to.deep.equal({ first: maxPageSize });
  });

  it('should set last to maxPageSize if its greater than maxPageSize', () => {
    const actual = validatePagination({ last: 200 });
    expect(actual).to.deep.equal({ last: maxPageSize });
  });
});
