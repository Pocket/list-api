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
  ).batchGetSavedItemsByGivenUrls(urls);

  return reorderSavedItemsByUrls(urls, savedItems);
}

/**
 * Creates a dataloader for saved items
 * @param context
 */
export function createSavedItemsDataLoader(context: IContext) {
  return new DataLoader((urls: string[]) =>
    batchGetSavedItemsByUrls(context, urls)
  );
}
