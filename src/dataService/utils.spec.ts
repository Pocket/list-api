import { strings } from 'locutus/php/';
import { expect } from 'chai';
import {
  cleanAndValidateTag,
  decodeBase64ToPlainText,
  mysqlTimeString,
} from './utils';

describe('cleanAndValidateTag', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should shorten to 25 characters', () => {
    const cleaned = cleanAndValidateTag(
      'let it be/ let it be/ let it be/ let it be/ speaking words of wisdom/ let it be'
    );
    expect(cleaned).to.equal('let it be/ let it be/ let');
  });
  it('should shorten without splitting emojis', () => {
    const tag =
      '\uD83D\uDEB4\u200D\u2640\uFE0F\uD83D\uDEB4\u200D\u2640\uFE0F\uD83D\uDEB4\u200D\u2640\uFE0F\uD83D\uDEB4\u200D\u2640\uFE0F';
    const cleaned = cleanAndValidateTag(tag);
    expect(cleaned).to.equal(tag).and.to.equal('🚴‍♀️🚴‍♀️🚴‍♀️🚴‍♀️');
  });
  it('should lowercase where possible', () => {
    const cleaned = cleanAndValidateTag('HÄÄÄÄ??');
    expect(cleaned).to.equal('hääää??');
    expect(cleanAndValidateTag('统一码')).to.equal('统一码');
  });
  it('should replace the unicode object replacement character with "?"', () => {
    const cleaned = cleanAndValidateTag('für Sarah\uFFFD');
    expect(cleaned).to.equal('für sarah?');
  });
  it('should trim whitespace', () => {
    const cleaned = cleanAndValidateTag('       \n o h  ');
    expect(cleaned).to.equal('o h');
  });
  it('should use `addslashes`', () => {
    const addslashesSpy = jest.spyOn(strings, 'addslashes');
    const cleaned = cleanAndValidateTag(`🤡-tdd-'is'\\"bug-free"-🤡`);
    expect(addslashesSpy.mock.calls.length).to.equal(1);
    expect(cleaned).to.equal(`🤡-tdd-\\'is\\'\\\\\\"bug-free\\"-🤡`);
  });
});

describe('mysql timestamp', () => {
  it('should convert to timestamp string in proper timezone', () => {
    const expected = '2021-07-28 11:19:15';
    const timestamp = new Date(1627489155000);
    const actual = mysqlTimeString(timestamp, 'US/Central');
    expect(actual).to.equal(expected);
  });
});

describe('base64 decode', () => {
  it('should decode base 64 to plain text string', () => {
    const expected = 'zebra';
    const input = 'emVicmE=';
    const actual = decodeBase64ToPlainText(input);
    expect(actual).to.equal(expected);
  });
});
