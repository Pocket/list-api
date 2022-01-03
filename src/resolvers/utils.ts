/**
 * Returns a savedItemMap from the list of tags.
 * @param tags list of tags from which savedItem keys are generated.
 */
import { PaginationInput } from '../types';
import { UserInputError } from 'apollo-server-errors';
import config from '../config';

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
  const defaultPageSize = config.pagination.defaultPageSize;
  const maxPageSize = config.pagination.maxPageSize;

  if (pagination == null) {
    return { first: defaultPageSize };
  }

  if (
    (pagination.before && pagination.after) ||
    (pagination.before && pagination.first) ||
    (pagination.last && pagination.after) ||
    (pagination.first && pagination.last)
  ) {
    throw new UserInputError('Please set either {after and first} or {before and last}');
  }

  if (pagination.before) {
    const before = parseInt(
      Buffer.from(pagination.before, 'base64').toString()
    );
    if (before < 0) {
      throw new UserInputError('Invalid before cursor');
    }

    if (!pagination.last) {
      pagination.last = defaultPageSize;
    }
  }

  if (pagination.after) {
    const after = parseInt(Buffer.from(pagination.after, 'base64').toString());
    if (after < 0) {
      throw new UserInputError('Invalid after cursor');
    }

    if (!pagination.first) {
      pagination.first = defaultPageSize;
    }
  }

  if (pagination.first <= 0) {
    pagination.first = defaultPageSize;
  }

  if (pagination.last <= 0) {
    pagination.last = defaultPageSize;
  }

  if (pagination.first > maxPageSize) {
    pagination.first = maxPageSize;
  }

  if (pagination.last > maxPageSize) {
    pagination.last = maxPageSize;
  }

  return pagination;
}
