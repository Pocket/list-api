import {
  savedItemById,
  savedItems,
  tags as userTags,
  savedItemsTemp,
} from './user';
import { savedItem } from './item';
import { item, tags as savedItemTags } from './savedItem';

import {
  createTags,
  deleteSavedItem,
  deleteSavedItemTags,
  deleteTag,
  updateSavedItemArchive,
  updateSavedItemFavorite,
  updateSavedItemRemoveTags,
  updateSavedItemTags,
  updateSavedItemUnArchive,
  updateSavedItemUnDelete,
  updateSavedItemUnFavorite,
  updateTag,
  upsertSavedItem,
} from './mutation';
import { tagsSavedItems } from './tag';
import { SavedItem } from '../types';
import { IContext } from '../server/context';

export const resolvers = {
  ItemResult: {
    __resolveType(savedItem: SavedItem) {
      return parseInt(savedItem.resolvedId) ? 'Item' : 'PendingItem';
    },
  },
  User: {
    savedItemById,
    savedItems,
    savedItemsTemp,
    tags: userTags,
  },
  Item: {
    savedItem,
  },
  SavedItem: {
    tags: savedItemTags,
    item,
    __resolveReference: async (savedItem, context: IContext) => {
      if (savedItem.id) {
        return await context.dataLoaders.savedItemsById.load(savedItem.id);
      } else {
        return await context.dataLoaders.savedItemsByUrl.load(savedItem.url);
      }
    },
  },
  Tag: {
    savedItems: tagsSavedItems,
  },
  Mutation: {
    upsertSavedItem,
    updateSavedItemFavorite,
    updateSavedItemUnFavorite,
    updateSavedItemArchive,
    updateSavedItemUnArchive,
    deleteSavedItem,
    updateSavedItemUnDelete,
    updateSavedItemTags,
    updateSavedItemRemoveTags,
    createTags,
    updateTag,
    deleteSavedItemTags,
    deleteTag,
  },
};
