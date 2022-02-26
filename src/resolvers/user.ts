import {
  Pagination,
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
import { validatePagination } from '@pocket-tools/apollo-utils';
import { IContext } from '../server/context';
import config from '../config';

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
    pagination: Pagination;
  },
  context: IContext
): Promise<SavedItemConnection> {
  args.pagination = validatePagination(
    args.pagination,
    config.pagination.defaultPageSize,
    config.pagination.maxPageSize
  );
  return new SavedItemDataService(context).getSavedItems(
    args.filter,
    args.sort,
    args.pagination
  );
}

/**
 * Get paginated saved items
 * @param parent
 * @param args
 * @param context
 */
export async function savedItemsTemp(
  parent: User,
  args: {
    filter: SavedItemsFilter;
    sort: SavedItemsSort;
    pagination: Pagination;
  },
  context: IContext
): Promise<any> {
  args.pagination = validatePagination(
    args.pagination,
    config.pagination.defaultPageSize,
    config.pagination.maxPageSize
  );
  const res = await new SavedItemDataService(context).getSavedItemsTemp();
  return res;
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
    pagination: Pagination;
  },
  context: IContext
): Promise<TagConnection> {
  args.pagination = validatePagination(
    args.pagination,
    config.pagination.defaultPageSize,
    config.pagination.maxPageSize
  );
  return await new TagDataService(context).getTagsByUser(
    parent.id,
    args.pagination
  );
}
