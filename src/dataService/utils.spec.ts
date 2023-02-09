import { expect } from 'chai';
import { mysqlDateConvert, mysqlTimeString } from './utils';

const dateGood = new Date('2008-11-03 08:51:01');
const dateNull = new Date('0000-00-00 00:00:00');

describe('mysqlDateConvert', () => {
  it('valid date in, valid date out', () => {
    const result = mysqlDateConvert(dateGood);
    expect(result).to.equal(dateGood);
  });
  it('invalid 0000-00-00 date in, null out', () => {
    const result = mysqlDateConvert(dateNull);
    expect(result).to.equal(null);
  });
  it('invalid string in, null out', () => {
    const result = mysqlDateConvert('notadate');
    expect(result).to.equal(null);
  });
  it('null in, null out', () => {
    const result = mysqlDateConvert(null);
    expect(result).to.equal(null);
  });
});
describe('mysqlTimeString', () => {
  it('should convert to timestamp string in proper timezone', () => {
    const expected = '2021-07-28 11:19:15';
    const timestamp = new Date(1627489155000);
    const actual = mysqlTimeString(timestamp, 'US/Central');
    expect(actual).to.equal(expected);
  });
});
