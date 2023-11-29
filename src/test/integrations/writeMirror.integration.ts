import { PocketSaveDataService, SavedItemDataService } from '../../dataService';
import { writeClient } from '../../database/client';
import { ItemResponse } from '../../externalCaller/parserCaller';
import { SavedItemUpsertInput } from '../../types';
import { expect } from '@jest/globals';
import unleashClient from '../../featureFlags/mockClient';
import config from '../../config';

function areBothNaN(a, b) {
  if (isNaN(a) && isNaN(b)) {
    return true;
  } else if (isNaN(a) || isNaN(b)) {
    return false;
  } else {
    return undefined;
  }
}

expect.addEqualityTesters([areBothNaN]);

describe('List API mirroring', () => {
  const db = writeClient();
  const date = new Date();
  const epochDate = date.getTime() / 1000;
  const unleash = unleashClient([
    {
      enabled: true,
      name: config.unleash.flags.mirrorWrites.name,
      stale: false,
      type: 'release',
      project: 'default',
      variants: [],
      strategies: [],
      impressionData: false,
    },
  ]);
  const savedItemService = new SavedItemDataService({
    dbClient: db,
    userId: '1',
    apiId: '777',
    unleash,
  });
  const pocketSaveService = new PocketSaveDataService({
    dbClient: db,
    userId: '1',
    apiId: '777',
    unleash,
  });

  const fetchRow = (itemId: string, tableName: string) => {
    return db(tableName)
      .select('*')
      .where({ user_id: 1, item_id: itemId })
      .first();
  };

  beforeEach(async () => {
    await db('list').truncate();
    await db('list_schema_update').truncate();
    const listSeed = {
      item_id: 1,
      status: 0,
      favorite: 0,
      user_id: 1,
      resolved_id: 1,
      given_url: 'http://1',
      title: 'title 1',
      time_added: date,
      time_updated: date,
      time_read: '0000-00-00 00:00:00',
      time_favorited: '0000-00-00 00:00:00',
      api_id: '777',
      api_id_updated: '777',
    };
    const shadowSeed = {
      item_id: 999,
      status: 0,
      favorite: 1,
      user_id: 1,
      resolved_id: 999,
      given_url: 'http://999',
      title: 'title 999',
      time_added: date,
      time_updated: date,
      time_read: '0000-00-00 00:00:00',
      time_favorited: date,
      api_id: '777',
      api_id_updated: '777',
    };
    await db('list').insert([shadowSeed, listSeed]);
    await db('list_schema_update').insert(shadowSeed);
  });
  afterAll(async () => {
    await db('list').truncate();
    await db('list_schema_update').truncate();
    unleash.destroy();
  });
  it('works for fields with zero-dates', async () => {
    const seedItem: ItemResponse = {
      itemId: '2',
      resolvedId: '2',
      title: 'title 2',
    };
    const seedSave: SavedItemUpsertInput = {
      url: 'http://2',
      isFavorite: false,
      timestamp: epochDate,
    };
    await savedItemService.upsertSavedItem(seedItem, seedSave);
    const listResult = await fetchRow('2', 'list');
    const shadowResult = await fetchRow('2', 'list_schema_update');
    expect(listResult).not.toBeNull();
    expect(listResult).toStrictEqual(shadowResult);
  });
  it('Copies new rows to shadow table on create', async () => {
    const seedItem: ItemResponse = {
      itemId: '2',
      resolvedId: '2',
      title: 'title 2',
    };
    const seedSave: SavedItemUpsertInput = {
      url: 'http://2',
      isFavorite: true,
      timestamp: epochDate,
    };
    await savedItemService.upsertSavedItem(seedItem, seedSave);
    const listResult = await fetchRow('2', 'list');
    const shadowResult = await fetchRow('2', 'list_schema_update');
    expect(listResult).not.toBeUndefined();
    expect(listResult).toStrictEqual(shadowResult);
  });
  it('Merges changes to shadow table for rows that already exist', async () => {
    await savedItemService.updateSavedItemArchiveProperty('999', true);
    const listResult = await fetchRow('999', 'list');
    const shadowResult = await fetchRow('999', 'list_schema_update');
    expect(listResult).not.toBeUndefined();
    expect(listResult.status).toEqual(1);
    expect(listResult).toStrictEqual(shadowResult);
  });
  it.each([
    {
      property: 'favorite - savedItem',
      method: () =>
        savedItemService.updateSavedItemFavoriteProperty('1', true, date),
    },
    {
      property: 'archived - savedItem',
      method: () =>
        savedItemService.updateSavedItemArchiveProperty('1', true, date),
    },
    {
      property: 'deleted - savedItem',
      method: () => savedItemService.deleteSavedItem('1', date),
    },
    {
      property: 'undeleted - savedItem',
      method: () => savedItemService.updateSavedItemUnDelete('1', date),
    },
    {
      property: 'favorite - pocketSave',
      method: () => pocketSaveService.favoriteListRow([1], date),
    },
    {
      property: 'archived - pocketSave',
      method: () => pocketSaveService.archiveListRow([1], date),
    },
    // No deleted/undeleted properties for pocketSave
  ])(
    'Copies new rows to shadow table on update: $property',
    async ({ method }) => {
      const preOperationResult = await fetchRow('1', 'list_schema_update');
      expect(preOperationResult).toBeUndefined();
      await method();
      const listResult = await fetchRow('1', 'list');
      const shadowResult = await fetchRow('1', 'list_schema_update');
      expect(listResult).not.toBeUndefined();
      expect(listResult).toStrictEqual(shadowResult);
    }
  );
  describe('with feature flag disabled', () => {
    const syncSpy = jest.spyOn(SavedItemDataService, 'syncShadowTable');
    const disabledUnleash = unleashClient([
      {
        enabled: false,
        name: config.unleash.flags.mirrorWrites.name,
        stale: false,
        type: 'release',
        project: 'default',
        variants: [],
        strategies: [],
        impressionData: false,
      },
    ]);
    const saveServiceNoSync = new SavedItemDataService({
      dbClient: db,
      userId: '1',
      apiId: '777',
      unleash: disabledUnleash,
    });
    const pocketServiceNoSync = new PocketSaveDataService({
      dbClient: db,
      userId: '1',
      apiId: '777',
      unleash: disabledUnleash,
    });
    const upsertSeed: { item: ItemResponse; save: SavedItemUpsertInput } = {
      item: {
        itemId: '1',
        resolvedId: '1',
        title: 'title 1',
      },
      save: {
        url: 'http://1',
        isFavorite: false,
        timestamp: epochDate,
      },
    };
    beforeEach(() => {
      syncSpy.mockClear();
    });
    afterAll(() => {
      syncSpy.mockRestore();
    });
    it.each([
      {
        property: 'upsert - savedItem',
        method: () =>
          saveServiceNoSync.upsertSavedItem(upsertSeed.item, upsertSeed.save),
      },
      {
        property: 'favorite - savedItem',
        method: () =>
          saveServiceNoSync.updateSavedItemFavoriteProperty('1', true, date),
      },
      {
        property: 'archived - savedItem',
        method: () =>
          saveServiceNoSync.updateSavedItemArchiveProperty('1', true, date),
      },
      {
        property: 'deleted - savedItem',
        method: () => saveServiceNoSync.deleteSavedItem('1', date),
      },
      {
        property: 'undeleted - savedItem',
        method: () => saveServiceNoSync.updateSavedItemUnDelete('1', date),
      },
      {
        property: 'favorite - pocketSave',
        method: () => pocketServiceNoSync.favoriteListRow([1], date),
      },
      {
        property: 'archived - pocketSave',
        method: () => pocketServiceNoSync.archiveListRow([1], date),
      },
      // No deleted/undeleted properties for pocketSave
    ])(
      'Does not sync when feature flag is disabled: $property',
      async ({ method }) => {
        const preOperationResult = await fetchRow('1', 'list_schema_update');
        expect(preOperationResult).toBeUndefined();
        await method();
        const listResult = await fetchRow('1', 'list');
        const shadowResult = await fetchRow('1', 'list_schema_update');
        expect(listResult).not.toBeUndefined();
        expect(shadowResult).toBeUndefined();
        expect(syncSpy).toBeCalledTimes(0);
      }
    );
    it('another test property', async () => {
      const method = () =>
        saveServiceNoSync.upsertSavedItem(upsertSeed.item, upsertSeed.save);
      const preOperationResult = await fetchRow('1', 'list_schema_update');
      expect(preOperationResult).toBeUndefined();
      await method();
      const listResult = await fetchRow('1', 'list');
      const shadowResult = await fetchRow('1', 'list_schema_update');
      expect(listResult).not.toBeUndefined();
      expect(shadowResult).toBeUndefined();
      expect(syncSpy).toBeCalledTimes(0);
    });
  });
});
