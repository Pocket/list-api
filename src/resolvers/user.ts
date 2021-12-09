import {
  PaginationInput,
  SavedItem,
  SavedItemConnection,
  SavedItemsFilter,
  SavedItemsSort,
  TagConnection,
  User,
} from '../types';
import {
  SavedItemDataService,
  TagDataService,
} from '../dataService/queryServices';
import { IContext } from '../server/context';

/**
 * Get saved item by ID
 * @param parent
 * @param args
 * @param context
 */
export function savedItemById(
  parent: User,
  args: { id: string },
  context: IContext
): Promise<SavedItem> {
  return new SavedItemDataService(context).getSavedItemById(args.id);
}

/**
 * Get paginated saved items
 * @param parent
 * @param args
 * @param context
 */
export function savedItems(
  parent: User,
  args: {
    filter: SavedItemsFilter;
    sort: SavedItemsSort;
    pagination: PaginationInput;
  },
  context: IContext
): Promise<SavedItemConnection> {
  return new SavedItemDataService(context).getSavedItems(
    args.filter,
    args.sort,
    args.pagination
  );
}

/**
 * Get user tags
 * @param parent
 * @param args
 * @param context
 */
export async function tags(
  parent: User,
  args: {
    pagination: PaginationInput;
  },
  context: IContext
): Promise<TagConnection> {
  return await new TagDataService(context).getTagsByUser(
    parent.id,
    args.pagination
  );
}
