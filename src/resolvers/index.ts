import { savedItemById, savedItems, tags as userTags } from './user';
import { savedItem } from './item';
import {
  item,
  tags as savedItemTags,
  suggestedTags as savedItemSuggestedTags,
} from './savedItem';
import { lazyParentLoad } from './utils';
import {
  createTags,
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
import { SavedItem, Tag } from '../types';
import { IContext } from '../server/context';
import { writeClient } from '../database/client';

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
    savedItem,
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
    id: (parent: Tag) => {
      return parent?.id ?? Buffer.from(parent.name).toString('base64');
    },
    // Fetching the below values in the suggested tags query (via join to `item_tags`)
    // dramatically reduces performance; only return them if requested. If the field is
    // already provided on the parent context, return that rather than fetching again.
    // Otherwise, batch load with DataLoader to avoid repeat calls to the database.
    _createdAt: (
      parent: Tag,
      args,
      context: IContext
    ): Promise<Tag['_createdAt']> =>
      lazyLoadTagAttribute(parent, context, '_createdAt'),
    _updatedAt: (parent: Tag, args, context: IContext) =>
      lazyLoadTagAttribute(parent, context, '_updatedAt'),
    _version: (parent: Tag, args, context: IContext) =>
      lazyLoadTagAttribute(parent, context, '_version'),
    _deletedAt: (parent: Tag, args, context: IContext) =>
      lazyLoadTagAttribute(parent, context, '_deletedAt'),
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
    context.dbClient = writeClient();
    return mutate(parent, args, context);
  };
}

/**
 * Convenience method for lazily loading Tag attributes, since
 * decorators are experimental in TS
 * @param parent Parent in the resolver chain
 * @param context GraphQL Context
 * @param attr attribute to fetch (name of field)
 * @returns the value keyed by `attr`
 */
function lazyLoadTagAttribute<A extends keyof Tag>(
  parent: Tag,
  context: IContext,
  attr: A
): Promise<Tag[A]> {
  return lazyParentLoad<Tag, string, A>(
    parent.name,
    context.dataLoaders.tagsByName,
    parent,
    attr
  );
}

export { resolvers };
