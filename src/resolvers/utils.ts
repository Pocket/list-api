/**
 * Returns a savedItemMap from the list of tags.
 * @param tags list of tags from which savedItem keys are generated.
 */
import { defaultPage, maxPageSize, PaginationInput } from '../types';

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

export function validatePagination(pagination: PaginationInput) {
  if (pagination == null) {
    return { first: defaultPage };
  }

  if (
    (pagination.before && pagination.after) ||
    (pagination.before && pagination.first) ||
    (pagination.last && pagination.after) ||
    (pagination.first && pagination.last)
  ) {
    throw new Error('Please set either {after and first} or {before and last}');
  }

  if (pagination.before) {
    const before = parseInt(
      Buffer.from(pagination.before, 'base64').toString()
    );
    if (before < 0) {
      throw new Error('invalid before cursor');
    }

    if (!pagination.last) {
      pagination.last = defaultPage;
    }
  }

  if (pagination.after) {
    const after = parseInt(Buffer.from(pagination.after, 'base64').toString());
    if (after < 0) {
      throw new Error('invalid after cursor');
    }

    if (!pagination.first) {
      pagination.first = defaultPage;
    }
  }

  if (pagination.first <= 0) {
    pagination.first = defaultPage;
  }

  if (pagination.last <= 0) {
    pagination.last = defaultPage;
  }

  if (pagination.first > maxPageSize) {
    pagination.first = maxPageSize;
  }

  if (pagination.last > maxPageSize) {
    pagination.last = maxPageSize;
  }

  return pagination;
}
