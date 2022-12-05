import { IContext } from '../server/context';
import DataLoader from 'dataloader';
import { SavedItemDataService, TagDataService } from '../dataService';
import { Tag } from '../types';
import { reorderResultByKey } from './utils';
import { TagModel } from '../models';

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
    const tags = await batchGetTagsByIds(context, ids);
    tags.forEach((tag) => byNameLoader.prime(tag.name, tag));
    return tags;
  });
  const byNameLoader = new DataLoader(async (names: string[]) => {
    const tags = await batchGetTagsByNames(context, names);
    tags.forEach((tag) => byIdLoader.prime(tag.id, tag));
    return tags;
  });
  return { tagsById: byIdLoader, tagsByName: byNameLoader };
}

export async function batchGetTagsByIds(
  context: IContext,
  ids: string[]
): Promise<Tag[]> {
  const names = ids.map(TagModel.decodeId);
  const tags = await batchGetTagsByNames(context, names);
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
