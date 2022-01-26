import { expect } from 'chai';
import { SavedItem } from '../types';
import {
  reorderSavedItemsByIds,
  reorderSavedItemsByUrls,
} from './savedItemsDataLoader';

describe('savedItemsDataLoader', () => {
  const savedItems: SavedItem[] = [
    {
      id: '1',
      resolvedId: '1',
      url: 'dont-care.com',
      isFavorite: false,
      status: 'UNREAD',
      isArchived: false,
      item: {
        givenUrl: 'dont-care.com',
      },
    },
    {
      id: '2',
      resolvedId: '2',
      url: 'dont-care-too.com',
      isFavorite: false,
      status: 'UNREAD',
      isArchived: false,
      item: {
        givenUrl: 'dont-care-too.com',
      },
    },
  ];
  it('can reorder a list of saved items based on a given list of ids', () => {
    const reorderedSavedItems = reorderSavedItemsByIds(
      ['2', '1', '3'],
      savedItems
    );

    expect(reorderedSavedItems[0]).to.deep.equal(savedItems[1]);
    expect(reorderedSavedItems[1]).to.deep.equal(savedItems[0]);
    expect(reorderedSavedItems[2]).to.equal(undefined);
  });
  it('can reorder a list of saved items based on a given list of urls', () => {
    const reorderedSavedItems = reorderSavedItemsByUrls(
      ['dont-care-too.com', 'dont-care.com', 'not-found.com'],
      savedItems
    );

    expect(reorderedSavedItems[0]).to.deep.equal(savedItems[1]);
    expect(reorderedSavedItems[1]).to.deep.equal(savedItems[0]);
    expect(reorderedSavedItems[2]).to.equal(undefined);
  });
});
