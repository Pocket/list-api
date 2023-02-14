import { mysqlDateConvert, mysqlTimeString, uniqueArray } from './utils';

const dateGood = new Date('2008-11-03 08:51:01');
const dateNull = new Date('0000-00-00 00:00:00');

describe('mysqlDateConvert', () => {
  it('valid date in, valid date out', () => {
    const result = mysqlDateConvert(dateGood);
    expect(result).toEqual(dateGood);
  });
  it('invalid 0000-00-00 date in, null out', () => {
    const result = mysqlDateConvert(dateNull);
    expect(result).toBeNull();
  });
  it('invalid string in, null out', () => {
    const result = mysqlDateConvert('notadate');
    expect(result).toBeNull();
  });
  it('null in, null out', () => {
    const result = mysqlDateConvert(null);
    expect(result).toBeNull();
  });
});
describe('mysqlTimeString', () => {
  it('should convert to timestamp string in proper timezone', () => {
    const expected = '2021-07-28 11:19:15';
    const timestamp = new Date(1627489155000);
    const actual = mysqlTimeString(timestamp, 'US/Central');
    expect(actual).toEqual(expected);
  });
});

describe('uniqueArray', () => {
  // Type signature of test.each inputs was causing issues,
  // so separate them out to not be a union...
  test.each([
    { arr: [], expected: [] },
    { arr: ['a'], expected: ['a'] },
    { arr: ['a', 'a', 'a', 'a'], expected: ['a'] },
    { arr: ['a', 'b', 'c', 'd'], expected: ['a', 'b', 'c', 'd'] },
  ])('returns unique values for strings', ({ arr, expected }) => {
    // Can do arrayContaining twice to get array equivalence
    const actual = uniqueArray(arr);
    expect(actual).toIncludeSameMembers(expected);
  });
  test.each([
    { arr: [], expected: [] },
    { arr: [1], expected: [1] },
    { arr: [1, 1, 1, 1], expected: [1] },
    { arr: [1, 2, 3, 4], expected: [1, 2, 3, 4] },
  ])('returns unique values for numbers', ({ arr, expected }) => {
    // Can do arrayContaining twice to get array equivalence
    const actual = uniqueArray(arr);
    expect(actual).toIncludeSameMembers(expected);
  });
});
