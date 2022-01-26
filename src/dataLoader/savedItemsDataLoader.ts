import DataLoader from 'dataloader';
import { SavedItemDataService } from '../dataService/queryServices';
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
    return {
      ...acc,
      [savedItem.url]: savedItem,
    };
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
) {
  const savedItems = await new SavedItemDataService(
    context
  ).batchGetSavedItemsByGivenUrl(urls);

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
    return {
      ...acc,
      [savedItem.id]: savedItem,
    };
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
) {
  const savedItems = await new SavedItemDataService(
    context
  ).batchGetSavedItemsByGivenIds(ids);

  return reorderSavedItemsByIds(ids, savedItems);
}

/**
 * Creates a dataloader for saved items
 * @param context
 */
export function createSavedItemsDataLoaderById(context: IContext) {
  return new DataLoader((ids: string[]) =>
    batchGetSavedItemsByIds(context, ids)
  );
}

/**
 * Creates a dataloader for saved items
 * @param context
 */
export function createSavedItemsDataLoaderUrls(context: IContext) {
  return new DataLoader((urls: string[]) =>
    batchGetSavedItemsByUrls(context, urls)
  );
}
