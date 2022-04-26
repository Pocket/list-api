import chai, { expect } from 'chai';
import { readClient, writeClient } from '../../database/client';
import { SavedItemDataService } from '../../dataService';
import { ContextManager } from '../../server/context';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';

chai.use(deepEqualInAnyOrder);

describe('SavedItemsService', () => {
  beforeAll(async () => {
    const db = writeClient();
    const date = new Date('2020-10-03 10:20:30');

    await db('list').truncate();
    await db('list').insert([
      {
        user_id: 1,
        item_id: 1,
        resolved_id: 1,
        given_url: 'https://abc',
        title: 'my title',
        time_added: date,
        time_updated: date,
        time_read: date,
        time_favorited: date,
        api_id: 'apiid',
        status: 0,
        favorite: 1,
        api_id_updated: 'apiid',
      },
      {
        user_id: 1,
        item_id: 2,
        resolved_id: 2,
        given_url: 'https://def',
        title: 'my title2',
        time_added: date,
        time_updated: date,
        time_read: date,
        time_favorited: date,
        api_id: 'apiid',
        status: 2,
        favorite: 1,
        api_id_updated: 'apiid',
      },
    ]);
  });

  it('fetches saved items for multiple urls for the same user', async () => {
    const context = new ContextManager({
      request: {
        headers: { userid: '1', apiid: '0' },
      },
      dbClient: readClient(),
      eventEmitter: null,
    });

    const savedItems = await new SavedItemDataService(
      context
    ).batchGetSavedItemsByGivenUrls(['https://abc', 'https://def']);

    expect(savedItems[0].url).to.equal('https://abc');
    expect(savedItems[1].url).to.equal('https://def');
  });

  it('fetches saved items for multiple ids for the same user', async () => {
    const context = new ContextManager({
      request: {
        headers: { userid: '1', apiid: '0' },
      },
      dbClient: readClient(),
      eventEmitter: null,
    });

    const savedItems = await new SavedItemDataService(
      context
    ).batchGetSavedItemsByGivenIds(['1', '2']);

    expect(savedItems[0].url).to.equal('https://abc');
    expect(savedItems[1].url).to.equal('https://def');
  });
});
