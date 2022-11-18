import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { ParserCaller } from './parserCaller';
import nock from 'nock';
import config from '../config';

chai.use(chaiAsPromised);

function mockParserGetItemRequest(urlToParse: string, data: any) {
  nock(config.parserDomain)
    .get(`/${config.parserVersion}/getItemListApi`)
    .query({ url: urlToParse, getItem: '1' })
    .reply(200, data);
}

function mockParserGetItemRequestFailed(urlToParse: string, data: any) {
  nock(config.parserDomain)
    .get(`/${config.parserVersion}/getItemListApi`)
    .query({ url: urlToParse, getItem: '1' })
    .reply(500, data);
}

describe('ParserCallerTest', function () {
  const urlToParse = 'https://igiveyou.a.test';

  it('should retrieve item id from parser service', async () => {
    mockParserGetItemRequest(urlToParse, {
      item: {
        given_url: urlToParse,
        item_id: 8,
        resolved_id: 9,
        title: 'The Not Evil Search Engine',
      },
    });

    const res = await ParserCaller.getOrCreateItem(urlToParse);
    expect(res.itemId).equals(8);
    expect(res.title).equals('The Not Evil Search Engine');
    expect(res.resolvedId).equals(9);
  });

  it('should throw error when there is no item in the response', async () => {
    mockParserGetItemRequest(urlToParse, {});

    const res = ParserCaller.getOrCreateItem(urlToParse);
    expect(res).to.be.rejectedWith(
      `Unable to parse and generate item for ${urlToParse}`
    );
  });

  it('should throw error when the item id is null', async () => {
    mockParserGetItemRequest(urlToParse, {
      item: {
        given_url: urlToParse,
        item_id: null,
      },
    });

    const res = ParserCaller.getOrCreateItem(urlToParse);
    expect(res).to.be.rejectedWith(
      `Unable to parse and generate item for ${urlToParse}`
    );
  });

  it('should throw error when the resolved id is null', async () => {
    mockParserGetItemRequest(urlToParse, {
      item: {
        given_url: urlToParse,
        resolved_id: null,
      },
    });

    const res = ParserCaller.getOrCreateItem(urlToParse);
    expect(res).to.be.rejectedWith(
      `Unable to parse and generate item for ${urlToParse}`
    );
  });

  it('should retry parser request 3 times when fails', async () => {
    mockParserGetItemRequestFailed(urlToParse, {
      item: {
        given_url: urlToParse,
        resolved_id: null,
      },
    });

    mockParserGetItemRequestFailed(urlToParse, {
      item: {
        given_url: urlToParse,
        resolved_id: null,
      },
    });

    mockParserGetItemRequest(urlToParse, {
      item: {
        given_url: urlToParse,
        resolved_id: null,
      },
    });

    const res = await ParserCaller.getOrCreateItem(urlToParse);
    expect(res.itemId).equals(8);
    expect(res.title).equals('The Not Evil Search Engine');
    expect(res.resolvedId).equals(9);
  });
});
