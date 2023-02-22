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
import {
  BaseError,
  Item,
  PocketSave,
  SaveWriteMutationPayload,
  SavedItem,
  Tag,
} from '../types';
import { IContext } from '../server/context';
import { PocketDefaultScalars } from '@pocket-tools/apollo-utils';
import { GraphQLResolveInfo } from 'graphql';

const resolvers = {
  ...PocketDefaultScalars,
  BaseError: {
    __resolveType(parent: BaseError) {
      return parent.__typename;
    },
  },
  ItemResult: {
    __resolveType(savedItem: SavedItem) {
      return parseInt(savedItem.resolvedId) ? 'Item' : 'PendingItem';
    },
  },
  User: {
    saveById(_parent: any, args: any, context: IContext): Promise<PocketSave> {
      return context.models.pocketSave.getById(args.id);
    },
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
  PocketSave: {
    suggestedTags(parent: PocketSave, _args: any, context: IContext) {
      return context.models.tag.getSuggestedBySaveId(parent);
    },
    tags(parent: PocketSave, _args: any, context: IContext) {
      return context.models.tag.getBySaveId(parent.id);
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
    saveArchive: async (
      _,
      args: { id: string[]; timestamp: Date },
      context: IContext,
      info: GraphQLResolveInfo
    ): Promise<SaveWriteMutationPayload> => {
      return await context.models.pocketSave.saveArchive(
        args.id,
        args.timestamp,
        info.path
      );
    },
  },
};

export { resolvers };
