import { SavedItemTagsInput, SavedItemTagsMap, TagCreateInput } from '../types';

/**
 * Returns a savedItemMap from the list of tags.
 * @param tags list of tags from which savedItem keys are generated.
 */
export function getSavedItemMapFromTags(tags) {
  const savedItemMap = {};
  tags.forEach((tag) => {
    tag.savedItems.forEach((savedItemId) => {
      if (savedItemMap[savedItemId]) {
        savedItemMap[savedItemId].push(tag);
      } else {
        savedItemMap[savedItemId] = [tag];
      }
    });
  });
  return savedItemMap;
}

/**
 * function to convert savedItemTagsInput list to a
 * map of savedItemId and its unique tag names.
 * @param input savedItemInput list
 * @returns map with savedItemId and its unique tagNames
 */
export function getSavedItemTagsMap(
  input: SavedItemTagsInput[]
): SavedItemTagsMap {
  return input.reduce((savedItemTags, input) => {
    let tags = input.tags;
    if (savedItemTags[input.savedItemId]) {
      tags = savedItemTags[input.savedItemId].concat(tags);
    }
    savedItemTags[input.savedItemId] = [...new Set(tags)];
    return savedItemTags;
  }, {});
}

/**
 * converts savedItemTagsMap to tagsCreateInput list
 * @param savedItemTagsMap
 */
export function convertToTagCreateInputs(
  savedItemTagsMap: SavedItemTagsMap
): TagCreateInput[] {
  const tagCreateInputs: TagCreateInput[] = [];
  for (const savedItemId in savedItemTagsMap) {
    const tags = savedItemTagsMap[savedItemId];
    for (const tag of tags) {
      tagCreateInputs.push({
        name: tag,
        savedItemId: savedItemId,
      });
    }
  }

  return tagCreateInputs;
}
