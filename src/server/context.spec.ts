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
  let batchQueryFnSpy;

  beforeEach(() => {
    batchQueryFnSpy =
      SavedItemDataService.prototype.batchGetSavedItemsByGivenUrls = jest
        .fn()
        .mockResolvedValue([savedItem]);
  });
  afterEach(() => jest.clearAllMocks());

  it('creates a data loader for saved items on initialization', async () => {
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
  it('Uses the same dataloader for every load request', async () => {
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

    // Referencing the loader 2x should return the same object
    const loader = context.dataLoaders.savedItemsByUrl;
    const loaderAgain = context.dataLoaders.savedItemsByUrl;
    await loader.load('dont-care.com');
    // At this point both loaders should have filled cache since referencing same object
    expect(Array.from((loader as any)._cacheMap.keys())).to.contain(
      'dont-care.com'
    );
    expect(Array.from((loaderAgain as any)._cacheMap.keys())).to.contain(
      'dont-care.com'
    );
    await loaderAgain.load('dont-care.com');
    // Second load should have used the cache, so only one call to batch fn
    expect(batchQueryFnSpy.mock.calls.length).to.equal(1);
  });
});
