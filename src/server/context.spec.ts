import { expect } from 'chai';
import { ContextManager } from './context';
import { Knex } from 'knex';
import DataLoader from 'dataloader';
import { SavedItemDataService } from '../dataService/queryServices';
import { SavedItem } from '../types';

jest.mock('../dataService/queryServices');

describe('context', () => {
  const savedItem: SavedItem = {
    id: '1',
    resolvedId: '1',
    url: 'dont-care.com',
    isFavorite: false,
    status: 'UNREAD',
    isArchived: false,
    item: {
      givenUrl: 'dont-care.com',
    },
  };
  afterEach(() => jest.clearAllMocks());

  it('creates a data loader for saved items on initialization', async () => {
    const batchQueryFnSpy =
      (SavedItemDataService.prototype.batchGetSavedItemsByGivenIds = jest
        .fn()
        .mockResolvedValue([savedItem]));

    const context = new ContextManager({
      request: {
        headers: { userid: '1', apiid: '0' },
      },
      db: {
        readClient: jest.fn() as unknown as Knex,
        writeClient: jest.fn() as unknown as Knex,
      },
      eventEmitter: null,
    });

    const savedItems = await context.dataLoaders.savedItemsById.load('1');

    expect(context.dataLoaders.savedItemsById).to.be.instanceof(DataLoader);
    expect(batchQueryFnSpy.mock.calls[0][0]).to.deep.equal(['1']);
    expect(savedItems).to.deep.equal(savedItem);
  });

  it('creates a data loader for saved items on initialization', async () => {
    const batchQueryFnSpy =
      (SavedItemDataService.prototype.batchGetSavedItemsByGivenUrl = jest
        .fn()
        .mockResolvedValue([savedItem]));

    const context = new ContextManager({
      request: {
        headers: { userid: '1', apiid: '0' },
      },
      db: {
        readClient: jest.fn() as unknown as Knex,
        writeClient: jest.fn() as unknown as Knex,
      },
      eventEmitter: null,
    });

    const savedItems = await context.dataLoaders.savedItemsByUrl.load(
      'dont-care.com'
    );

    expect(context.dataLoaders.savedItemsByUrl).to.be.instanceof(DataLoader);
    expect(batchQueryFnSpy.mock.calls[0][0]).to.deep.equal(['dont-care.com']);
    expect(savedItems).to.deep.equal(savedItem);
  });
});
