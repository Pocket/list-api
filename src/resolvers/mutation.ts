import {
  SavedItem,
  SavedItemUpsertInput,
  TagCreateInput,
  TagUpdateInput,
  Tag,
  DeleteSavedItemTagsInput,
  SavedItemTagUpdateInput,
  SavedItemTagsInput,
} from '../types';
import { IContext } from '../server/context';
import { ParserCaller } from '../externalCaller/parserCaller';
import { SavedItemDataService, TagDataService } from '../dataService';
import * as Sentry from '@sentry/node';
import { EventType } from '../businessEvents';
import { decodeBase64ToPlainText } from '../dataService/utils';
import { getSavedItemMapFromTags } from './utils';
import { NotFoundError } from '@pocket-tools/apollo-utils';
import { ApolloError, UserInputError } from 'apollo-server-errors';

/**
 * Create or re-add a saved item in a user's list.
 * Note that if the item already exists in a user's list, the item's 'favorite'
 * property will only be updated if 'SavedItemUpsertInput.isFavorite' == true.
 * To 'unfavorite' a SavedItem, use the updateSavedItemUnfavorite mutation instead.
 * @param _
 * @param args
 * @param context
 */
export async function upsertSavedItem(
  _,
  args,
  context: IContext
): Promise<SavedItem> {
  const savedItemUpsertInput: SavedItemUpsertInput = args.input;
  const savedItemDataService = new SavedItemDataService(context);

  try {
    const item = await ParserCaller.getOrCreateItem(savedItemUpsertInput.url);
    const existingItem = await savedItemDataService.getSavedItemById(
      item.itemId.toString()
    );
    // Keep track of whether the request was originally to favorite an item,
    // and whether it's a new favorite or item was favorited already
    const shouldSendFavoriteEvent =
      savedItemUpsertInput.isFavorite && !existingItem?.isFavorite;
    // Don't unfavorite an existing favorited item
    if (existingItem != null && !savedItemUpsertInput.isFavorite) {
      savedItemUpsertInput.isFavorite = existingItem.isFavorite;
    }
    const upsertedItem = await savedItemDataService.upsertSavedItem(
      item,
      savedItemUpsertInput
    );

    if (upsertedItem == undefined) {
      console.info(`savedUrl: ${savedItemUpsertInput.url}`);
      throw new ApolloError(`unable to add an item`);
    }

    if (existingItem != null) {
      // was an update, not a new insert
      if (existingItem.isArchived) {
        context.emitItemEvent(EventType.UNARCHIVE_ITEM, upsertedItem);
      }
    } else {
      // Was a new add
      context.emitItemEvent(EventType.ADD_ITEM, upsertedItem);
    }
    if (shouldSendFavoriteEvent) {
      context.emitItemEvent(EventType.FAVORITE_ITEM, upsertedItem);
    }
    return upsertedItem;
  } catch (e) {
    console.log(e.message);
    Sentry.captureException(e);
    throw new ApolloError(
      `unable to add item with url: ${savedItemUpsertInput.url}`
    );
  }
}

/**
 * Favorite a saved item
 * @param root
 * @param args
 * @param context
 */
export async function updateSavedItemFavorite(
  root,
  args: { id: string },
  context: IContext
): Promise<SavedItem> {
  const savedItemService = new SavedItemDataService(context);
  const savedItem = await savedItemService.updateSavedItemFavoriteProperty(
    args.id,
    true
  );
  context.emitItemEvent(EventType.FAVORITE_ITEM, savedItem);
  return savedItem;
}

/**
 * Unfavorite a saved item
 * @param root
 * @param args
 * @param context
 */
export async function updateSavedItemUnFavorite(
  root,
  args: { id: string },
  context: IContext
): Promise<SavedItem> {
  const savedItemService = new SavedItemDataService(context);
  const savedItem = await savedItemService.updateSavedItemFavoriteProperty(
    args.id,
    false
  );
  context.emitItemEvent(EventType.UNFAVORITE_ITEM, savedItem);
  return savedItem;
}

/**
 * Archive a saved item
 * @param root
 * @param args
 * @param context
 */
export async function updateSavedItemArchive(
  root,
  args: { id: string },
  context: IContext
): Promise<SavedItem> {
  const savedItemService = new SavedItemDataService(context);
  const savedItem = await savedItemService.updateSavedItemArchiveProperty(
    args.id,
    true
  );
  context.emitItemEvent(EventType.ARCHIVE_ITEM, savedItem);
  return savedItem;
}

/**
 * Unarchive a saved item
 * @param root
 * @param args
 * @param context
 */
export async function updateSavedItemUnArchive(
  root,
  args: { id: string },
  context: IContext
): Promise<SavedItem> {
  const savedItemService = new SavedItemDataService(context);
  const savedItem = await savedItemService.updateSavedItemArchiveProperty(
    args.id,
    false
  );
  context.emitItemEvent(EventType.UNARCHIVE_ITEM, savedItem);
  return savedItem;
}

/**
 * Soft delete a saved item
 * @param root
 * @param args
 * @param context
 */
export async function deleteSavedItem(
  root,
  args: { id: string },
  context: IContext
): Promise<string> {
  // TODO: setup a process to delete saved items X number of days after deleted
  const savedItemService = new SavedItemDataService(context);
  await savedItemService.deleteSavedItem(args.id);
  const savedItem = await savedItemService.getSavedItemById(args.id);
  context.emitItemEvent(EventType.DELETE_ITEM, savedItem);
  return args.id;
}

/**
 * Undelete a saved item
 * @param root
 * @param args
 * @param context
 */
export async function updateSavedItemUnDelete(
  root,
  args: { id: string },
  context: IContext
): Promise<SavedItem> {
  // TODO: when there is a process in place to permanently delete a saved item,
  // check if saved item exists before attempting to undelete.
  // TODO: Implement item undelete action
  return await new SavedItemDataService(context).updateSavedItemUnDelete(
    args.id
  );
}

/**
 * Replaces existing tags association with the input tagIds for a given savedItemId
 * todo: check for savedItemId before proceeding.
 * @param root
 * @param args savedItemTagUpdateInput gets savedItemId and the input tagIds
 * @param context
 */
export async function updateSavedItemTags(
  root,
  args: { input: SavedItemTagUpdateInput },
  context: IContext
): Promise<SavedItem> {
  const savedItemService = new SavedItemDataService(context);
  if (args.input.tagIds.length <= 0) {
    throw new UserInputError(
      'SavedItemTagUpdateInput.tagIds cannot be empty. use mutation updateSavedItemRemoveTags to' +
        'remove all tags'
    );
  }

  if (
    (await savedItemService.getSavedItemById(args.input.savedItemId)) == null
  ) {
    throw new NotFoundError(
      `SavedItem Id ${args.input.savedItemId} does not exist`
    );
  }

  const savedItem = await new TagDataService(
    context,
    new SavedItemDataService(context)
  ).updateSavedItemTags(args.input);
  context.emitItemEvent(
    EventType.REPLACE_TAGS,
    savedItem,
    args.input.tagIds.map((id) => decodeBase64ToPlainText(id))
  );
  return savedItem;
}

/**
 * deletes all the tags associated with the given savedItem id.
 * if the tag is associated only with the give itemId, then the tag
 * will be deleted too.
 * //todo: check for savedItemId before proceeding.
 * @param root
 * @param args savedItemId whose tags are to be removed.
 * @param context
 */
export async function updateSavedItemRemoveTags(
  root,
  args: { savedItemId: string },
  context: IContext
): Promise<SavedItem> {
  const savedItemService = new SavedItemDataService(context);
  const tagDataService = await new TagDataService(context, savedItemService);
  const tagsCleared = await tagDataService.getTagsByUserItem(args.savedItemId);

  const savedItem = await tagDataService.updateSavedItemRemoveTags(
    args.savedItemId
  );

  if (savedItem == null) {
    throw new NotFoundError(`SavedItem Id ${args.savedItemId} does not exist`);
  }

  context.emitItemEvent(
    EventType.CLEAR_TAGS,
    savedItem,
    tagsCleared.map((tag) => tag.name)
  );
  return savedItem;
}

export async function createTags(
  root,
  args: { input: TagCreateInput[] },
  context: IContext
): Promise<Tag[]> {
  // TODO: Fetch by ID when ID is not just the name
  const uniqueTagNames = [
    ...new Set(args.input.map((tagInput) => tagInput.name)),
  ];
  const savedItemService = new SavedItemDataService(context);
  const tagDataService = new TagDataService(context, savedItemService);

  await tagDataService.insertTags(args.input);
  const tags = await tagDataService.getTagsByName(uniqueTagNames);

  const savedItemMap = getSavedItemMapFromTags(tags);
  for (const savedItemId in savedItemMap) {
    context.emitItemEvent(
      EventType.ADD_TAGS,
      savedItemService.getSavedItemById(savedItemId),
      savedItemMap[savedItemId].map((tag) => tag.name)
    );
  }

  return tags;
}

/**
 * Mutation for untagging a saved item in a user's list.
 * Returns a list of SavedItem IDs to resolve
 */
export async function deleteSavedItemTags(
  root,
  args: { input: DeleteSavedItemTagsInput[] },
  context: IContext
): Promise<SavedItem[]> {
  try {
    const savedItemService = new SavedItemDataService(context);
    const tagDataService = new TagDataService(context, savedItemService);
    await tagDataService.deleteSavedItemAssociations(args.input);

    const savedItemsToReturn = [];
    for (const association of args.input) {
      const savedItem = savedItemService.getSavedItemById(
        association.savedItemId
      );

      context.emitItemEvent(
        EventType.REMOVE_TAGS,
        savedItem,
        association.tagIds.map((id) => decodeBase64ToPlainText(id))
      );
      savedItemsToReturn.push(savedItem);
    }
    return savedItemsToReturn;
  } catch (e) {
    console.log(e);
    Sentry.captureException(e);
    throw new ApolloError(
      `deleteSavedItemTags: server error while untagging a savedItem ${JSON.stringify(
        args.input
      )}`
    );
  }
}

/**
 * Mutation for deleting a tag entity. Removes all associations
 * between the deleted tag and SavedItems in the user's list.
 */
export async function deleteTag(
  root,
  args: { id: string },
  context: IContext
): Promise<string> {
  await new TagDataService(
    context,
    new SavedItemDataService(context)
  ).deleteTagObject(args.id);
  return args.id;
}

/**
 * rename a tag name
 * @param root
 * @param args TagUpdateInput that consist old tagId and the new tagName
 * @param context
 */
export async function updateTag(
  root,
  args: { input: TagUpdateInput },
  context: IContext
): Promise<Tag> {
  const tagDataService = new TagDataService(
    context,
    new SavedItemDataService(context)
  );
  const oldTagName = decodeBase64ToPlainText(args.input.id);
  let oldTagDetails;
  try {
    oldTagDetails = await tagDataService.getTagByName(oldTagName);
  } catch {
    const error = `Tag Id does not exist ${args.input.id}`;
    console.log(error);
    throw new ApolloError(error);
  }

  try {
    await tagDataService.updateTagByUser(args.input, oldTagDetails.savedItems);
    return await tagDataService.getTagByName(args.input.name);
  } catch (e) {
    console.log(e);
    Sentry.captureException(e);
    throw new ApolloError(
      `updateTag: server error while updating tag ${JSON.stringify(args.input)}`
    );
  }
}

/**
 * Replaces all tags for a given saved item with the tags provided in the input
 * @param root
 * @param args
 * @param context
 */
export async function replaceSavedItemTags(
  root,
  args: { input: SavedItemTagsInput[] },
  context: IContext
): Promise<SavedItem[]> {
  const savedItems = await new TagDataService(
    context,
    new SavedItemDataService(context)
  ).replaceSavedItemTags(args.input);

  const savedItemTagsMap = args.input.reduce((savedItemTags, input) => {
    let tags = input.tags;
    if (savedItemTags[input.savedItemId]) {
      tags = [...savedItemTags[input.savedItemId], ...input.tags];
    }
    return {
      ...savedItemTags,
      [input.savedItemId]: [...new Set([...tags])],
    };
  }, {});

  for (const savedItem of savedItems) {
    context.emitItemEvent(
      EventType.REPLACE_TAGS,
      savedItem,
      savedItemTagsMap[savedItem.id]
    );
  }

  return savedItems;
}
