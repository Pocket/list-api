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
