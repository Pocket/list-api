import { SavedItemConnection } from '../types';
import { IContext } from '../server/context';
import { SavedItemDataService } from '../dataService/queryServices/savedItemsService';
import { validatePagination } from '@pocket-tools/apollo-utils';

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
): Promise<SavedItemConnection> {
  args.pagination = validatePagination(args.pagination);
  const savedItemDataService = new SavedItemDataService(context);
  return await savedItemDataService.getPaginatedSavedItemsForListOfIds(
    parent.savedItems,
    args.pagination,
    args.filter,
    args.sort
  );
}
