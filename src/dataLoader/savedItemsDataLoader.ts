import DataLoader from 'dataloader';
import { SavedItemDataService } from '../dataService/queryServices';
import { IContext } from '../server/context';
import { SavedItem } from '../types';

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
export function createSavedItemsDataLoader(context: IContext) {
  return new DataLoader((ids: string[]) =>
    batchGetSavedItemsByIds(context, ids)
  );
}
