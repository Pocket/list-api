import { IContext } from '../server/context';
import DataLoader from 'dataloader';
import { SavedItemDataService, TagDataService } from '../dataService';
import { Tag } from '../types';
import { reorderResultByKey } from './utils';

/**
 * Create dataloaders to cache and batch requests for Tags made
 * in a single tick of the application.
 * There are two loaders for Tags which are differentiated by
 * keys: one accesses the Tag by ID, and one by name. Each loader
 * fills the cache of the other when loading from either key (since they
 * refer to the same object, just via alternative keys).
 * That way resolving the same object by alternative key does not result
 * in duplicate fetches.
 * @param context IContext object with database connection. Should
 * be freshly created for every GraphQL request.
 */
export function createTagDataLoaders(
  context: IContext
): Pick<IContext['dataLoaders'], 'tagsById' | 'tagsByName'> {
  const byIdLoader = new DataLoader(async (ids: string[]) => {
    const tags = await batchGetTagsByNames(context, ids);
    tags.forEach((item) => byNameLoader.prime(item.name, item));
    return tags;
  });
  const byNameLoader = new DataLoader(async (names: string[]) => {
    const tags = await batchGetTagsByIds(context, names);
    tags.forEach((item) => byIdLoader.prime(item.id, item));
    return tags;
  });
  return { tagsById: byIdLoader, tagsByName: byNameLoader };
}

export async function batchGetTagsByIds(
  context: IContext,
  ids: string[]
): Promise<Tag[]> {
  const savedItemService = new SavedItemDataService(context);
  const tags = await new TagDataService(context, savedItemService).getTagsById(
    ids
  );
  return reorderResultByKey<Tag, 'id'>({ key: 'id', values: ids }, tags);
}

export async function batchGetTagsByNames(
  context: IContext,
  names: string[]
): Promise<Tag[]> {
  const savedItemService = new SavedItemDataService(context);
  const tags = await new TagDataService(
    context,
    savedItemService
  ).getTagsByName(names);
  return reorderResultByKey<Tag, 'name'>({ key: 'name', values: names }, tags);
}
