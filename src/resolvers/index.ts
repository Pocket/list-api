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
import { writeClient } from '../database/client';
import { NotFoundError } from '@pocket-tools/apollo-utils';
import { DateTimeResolver } from 'graphql-scalars';

const resolvers = {
  ISOString: DateTimeResolver,
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
      const save = await context.dataLoaders.savedItemsByUrl.load(
        item.givenUrl
      );
      if (save == null) {
        throw new NotFoundError(`No Save found for url=${item.givenUrl}`);
      }
      return save;
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
  SavedItem: {
    createdAt: (parent: SavedItem, args, context: IContext) => {
      return parent._createdAt * 1000;
    },
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

// Wrap mutations with executeMutation to update the db connection to write
resolvers.Mutation = Object.keys(resolvers.Mutation).reduce(
  (mutations: any, mutationName) => {
    return {
      ...mutations,
      [mutationName]: executeMutation(resolvers.Mutation[mutationName]),
    };
  },
  {}
);

/**
 * Wrapper function to change context database to writeDb connection
 * @param mutate gets the mutation callback functions
 * returns a function that changes the db to writeDb and calls the mutation callBack
 */
export function executeMutation<Args, ReturnType>(
  mutate: (parent, args: Args, context: IContext) => Promise<ReturnType>
): (parent, args: Args, context: IContext) => Promise<ReturnType> {
  return async function (
    parent,
    args: Args,
    context: IContext
  ): Promise<ReturnType> {
    const dbClient = writeClient();
    const writeContext = context.withDbClientOverride(dbClient);
    return mutate(parent, args, writeContext);
  };
}

export { resolvers };
