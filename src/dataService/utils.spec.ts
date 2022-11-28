import { expect } from 'chai';
import { mysqlTimeString } from './utils';

describe('mysql timestamp', () => {
  it('should convert to timestamp string in proper timezone', () => {
    const expected = '2021-07-28 11:19:15';
    const timestamp = new Date(1627489155000);
    const actual = mysqlTimeString(timestamp, 'US/Central');
    expect(actual).to.equal(expected);
  });
});
