import DataLoader from 'dataloader';
import { SavedItemDataService } from '../dataService';
import { IContext } from '../server/context';
import { SavedItem } from '../types';

/**
 * Reorders saved items based on the URLs that are received to
 * keep the response in the same order of urls as requested
 * by the Apollo Gateway (Client API)
 * @param urls
 * @param savedItems
 */
export function reorderSavedItemsByUrls(
  urls: string[],
  savedItems: SavedItem[]
) {
  const urlToSavedItemMap = savedItems.reduce((acc, savedItem) => {
    acc[savedItem.url] = savedItem;
    return acc;
  }, {});

  return urls.map((url) => urlToSavedItemMap[url]);
}

/**
 * Batch loader function to get saved items by URLs
 * @param context
 * @param urls
 */
export async function batchGetSavedItemsByUrls(
  context: IContext,
  urls: string[]
): Promise<SavedItem[]> {
  const savedItems = await new SavedItemDataService(
    context
  ).batchGetSavedItemsByGivenUrls(urls);

  return reorderSavedItemsByUrls(urls, savedItems);
}

/**
 * Reorders savedItems based on the id that are received to
 * keep the response in the same order of savedItemIds as requested
 * by the Apollo Gateway (Client API)
 * @param ids
 * @param savedItems
 */
export function reorderSavedItemsByIds(ids: string[], savedItems: SavedItem[]) {
  const idToSavedItemMap = savedItems.reduce((acc, savedItem) => {
    acc[savedItem.id] = savedItem;
    return acc;
  }, {});

  return ids.map((id) => idToSavedItemMap[id]);
}

/**
 * Batch loader function to get savedItems by id.
 * @param context
 * @param ids list of savedItem ids.
 */
export async function batchGetSavedItemsByIds(
  context: IContext,
  ids: string[]
): Promise<SavedItem[]> {
  const savedItems = await new SavedItemDataService(
    context
  ).batchGetSavedItemsByGivenIds(ids);

  return reorderSavedItemsByIds(ids, savedItems);
}

/**
 * Create dataloaders to cache and batch requests for SavedItem made
 * in a single tick of the application.
 * There are two loaders for SavedItems which are differentiated by
 * keys: one accesses the SavedItem by ID, and one by URL. Each loader
 * fills the cache of the other when loading from either key (since they
 * refer to the same object, just via alternative keys).
 * That way resolving the same object by alternative key does not result
 * in duplicate fetches.
 * @param context IContext object with database connection. Should
 * be freshly created for every GraphQL request.
 */
export function createSavedItemDataLoaders(
  context: IContext
): Pick<IContext['dataLoaders'], 'savedItemsById' | 'savedItemsByUrl'> {
  const byIdLoader = new DataLoader(async (ids: string[]) => {
    const items = await batchGetSavedItemsByIds(context, ids);
    items.forEach((item) => byUrlLoader.prime(item.url, item));
    return items;
  });
  const byUrlLoader = new DataLoader(async (urls: string[]) => {
    const items = await batchGetSavedItemsByUrls(context, urls);
    items.forEach((item) => byIdLoader.prime(item.id, item));
    return items;
  });
  return { savedItemsById: byIdLoader, savedItemsByUrl: byUrlLoader };
}
