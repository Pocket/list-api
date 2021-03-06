import { SavedItemConnection, SavedItemsFilter } from '../types';
import { IContext } from '../server/context';
import { validatePagination } from '@pocket-tools/apollo-utils';
import { ListPaginationService } from '../dataService';
import { Tag } from '../types';
import { GraphQLResolveInfo } from 'graphql';
import { UserInputError } from 'apollo-server-express';

/**
 * Get list of savedItems for a given Tag
 * @param parent Tag, but keep them undefined so we can access itemIds
 * @param args
 * @param context
 */
export async function tagsSavedItems(
  parent: Tag,
  args,
  context: IContext,
  info: GraphQLResolveInfo
): Promise<SavedItemConnection> {
  args.pagination = validatePagination(args.pagination);
  // Disallow before/after pagination if this field is already
  // nested under a paginated result/array; in that case, only first/last
  // makes sense (e.g. showing a preview of the first X SavedItems
  // associated with each paginated Tag)
  const savedItemDataService = new ListPaginationService(context);
  let foundArray = false;
  let parentResolver = info.path.prev; // skip current
  while (!(foundArray || parentResolver == null)) {
    if (parentResolver.typename == 'TagEdge' || parentResolver.key == 'tags') {
      foundArray = true;
    }
    parentResolver = parentResolver.prev;
  }
  if (foundArray) {
    if (args.pagination.before || args.pagination.after) {
      throw new UserInputError(
        'Cannot specify a cursor on a nested paginated field.'
      );
    }
  }
  // Now get result
  // If the IDs are on the parent, use them
  if (parent.savedItems != null) {
    return savedItemDataService.getSavedItems(
      args.filter,
      args.sort,
      args.pagination,
      parent.savedItems
    );
  } else {
    // Use filter to retrieve the SavedItems if IDs are not on the parent
    const tagFilter: SavedItemsFilter = {
      ...args.filter,
      tagNames: [parent.name],
    };
    return savedItemDataService.getSavedItems(
      tagFilter,
      args.sort,
      args.pagination
    );
  }
}
