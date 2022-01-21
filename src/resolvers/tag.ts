import { SavedItem } from '../types';
import { IContext } from '../server/context';
import { SavedItemDataService } from '../dataService/queryServices/savedItemsService';
import { validatePagination } from '@pocket-tools/apollo-utils';

/**
 * Get list of savedItems for a given Tag
 * @param parent Tag, but keep them undefined so we can access itemIds
 * @param args
 * @param context
 */
//todo: function to change
export async function tagsSavedItems(
  parent: any,
  args,
  context: IContext
): Promise<SavedItem[]> {
  args.pagination = validatePagination(args.pagination);
  const savedItemDataService = new SavedItemDataService(context);
  return await savedItemDataService.getSavedItemsForListOfIds(
    parent.savedItems,
    args.pagination,
    args.filter,
    args.sort
  );
}
