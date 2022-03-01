import { Item, PendingItem, PendingItemStatus, SavedItem, Tag } from '../types';
import { SavedItemDataService, TagDataService } from '../dataService';
import { IContext } from '../server/context';

/**
 * Get paginated saved item tags
 * @param parent
 * @param args
 * @param context
 */
export async function tags(
  parent: SavedItem,
  args,
  context: IContext
): Promise<Tag[]> {
  return new TagDataService(
    context,
    new SavedItemDataService(context)
  ).getTagsByUserItem(parent.id);
}

/**
 * Resolve Item entity using the givenUrl
 * @param parent
 */
export async function item(parent: SavedItem): Promise<Item | PendingItem> {
  if (parseInt(parent.resolvedId)) {
    return {
      __typename: 'Item',
      givenUrl: parent.url,
      resolvedId: parent.resolvedId,
    };
  }
  return {
    __typename: 'PendingItem',
    url: parent.url,
    status: PendingItemStatus.UNRESOLVED,
  };
}
