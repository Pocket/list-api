import { SavedItem } from '../types';
import { IContext } from '../server/context';
import { SavedItemDataService } from '../dataService/queryServices/savedItemsService';

/**
 * Get list of savedItems for a given Tag
 * @param parent Tag, but keep them undefined so we can access itemIds
 * @param args
 * @param context
 */
export async function tagsSavedItems(
  parent: any,
  args,
  context: IContext
): Promise<SavedItem[]> {
  const savedItemDataService = new SavedItemDataService(context);
  return await savedItemDataService.getSavedItemsForListOfIds(
    parent.savedItems
  );
}
