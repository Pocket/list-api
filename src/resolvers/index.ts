import { savedItemById, savedItems, tags as userTags } from './user';
import {
  item,
  tags as savedItemTags,
  suggestedTags as savedItemSuggestedTags,
} from './savedItem';
import {
  createSavedItemTags,
  deleteSavedItem,
  deleteSavedItemTags,
  deleteTag,
  replaceSavedItemTags,
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
import { Item, SavedItem, Tag } from '../types';
import { IContext } from '../server/context';

const resolvers = {
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
    savedItem: async (item: Item, args, context: IContext) => {
      return await context.dataLoaders.savedItemsByUrl.load(item.givenUrl);
    },
    // This is basically a passthrough so that the givenUrl is available
    // on the parent when the savedItem entity is resolved
    // Possible to resolve savedItem on this reference resolver instead,
    // but this maintains our pattern of separation of entity resolvers
    // If other scalar fields were resolved by list on Item, they'd go here
    __resolveReference: async (item: Item, context: IContext) => {
      return item;
    },
  },
  CorpusItem: {
    savedItem: async ({ url }, args, context: IContext) => {
      return await context.dataLoaders.savedItemsByUrl.load(url);
    },
  },
  SavedItem: {
    tags: savedItemTags,
    suggestedTags: savedItemSuggestedTags,
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
    // ID isn't modeled in the DB
    // Use resolvers to separate this from data layer logic
    id: (parent: Tag, _, context: IContext) => {
      return context.models.tag.resolveId(parent);
    },
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
    updateTag,
    deleteSavedItemTags,
    deleteTag,
    createSavedItemTags,
    replaceSavedItemTags,
  },
};

export { resolvers };
