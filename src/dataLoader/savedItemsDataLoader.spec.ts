import { SavedItem } from '../types';
import sinon from 'sinon';
import { SavedItemDataService } from '../dataService';
import { batchGetSavedItemsByIds } from './savedItemsDataLoader';
import { writeClient } from '../database/client';

describe('savedItem data loader', function () {
  const testSavedItem: SavedItem[] = [
    {
      id: '1',
      resolvedId: '1',
      url: 'abc.com',
      isFavorite: false,
      isArchived: false,
      status: 'UNREAD',
      item: {
        givenUrl: 'abc.com',
      },
    },
    {
      id: '2',
      resolvedId: '2',
      url: 'def.com',
      isFavorite: false,
      isArchived: false,
      status: 'DELETED',
      item: {
        givenUrl: 'def.com',
      },
    },
  ];
  it('should not return deleted items', async () => {
    const promiseSavedItem = Promise.resolve(testSavedItem);
    const db = writeClient();
    const service = new SavedItemDataService({
      dbClient: db,
      userId: '1',
      apiId: 'backend',
    });
    sinon
      .stub(service, 'batchGetSavedItemsByGivenIds')
      .returns(promiseSavedItem);

    const items = await batchGetSavedItemsByIds(service, ['1', '2']);
    items.forEach((item) => expect(item.id).not.toBe('2'));
  });

  it('should not return undefined in the batch for non-existent IDs', async () => {
    const promiseSavedItem = Promise.resolve(testSavedItem);
    const db = writeClient();
    const service = new SavedItemDataService({
      dbClient: db,
      userId: '1',
      apiId: 'backend',
    });
    sinon
      .stub(service, 'batchGetSavedItemsByGivenIds')
      .returns(promiseSavedItem);

    const items = await batchGetSavedItemsByIds(service, ['1', '3']);
    items.forEach((item) => expect(item.id).not.toBe('undefined'));
  });
});
