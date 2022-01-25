import { savedItemById, savedItems, tags as userTags } from './user';
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
    tags: userTags,
  },
  Item: {
    savedItem,
  },
  SavedItem: {
    tags: savedItemTags,
    item,
    __resolveReference: async (savedItem, context: IContext) => {
      return await context.dataLoaders.savedItems.load(savedItem.id);
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
