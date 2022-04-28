import { SavedItemTagsInput } from '../types';

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
export function getSavedItemTagsMap(input: SavedItemTagsInput[]): {
  [savedItemId: string]: string[];
} {
  const savedItemTagsMap = input.reduce((savedItemTags, input) => {
    let tags = input.tags;
    if (savedItemTags[input.savedItemId]) {
      tags = [...savedItemTags[input.savedItemId], ...input.tags];
    }
    return {
      ...savedItemTags,
      [input.savedItemId]: [...new Set([...tags])],
    };
  }, {});

  return savedItemTagsMap;
}
