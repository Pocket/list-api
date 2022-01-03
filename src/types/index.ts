export type User = {
  id: string;
};

export type PageInfo = {
  endCursor?: string;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
};

export type SavedItemConnection = {
  edges: SavedItemEdge[];
  nodes: SavedItem[];
  pageInfo: PageInfo;
  totalCount: number;
};

export type SavedItemEdge = {
  cursor: string;
  node?: SavedItem;
};

export type RemoteEntity = {
  id: string;
  _createdAt?: number;
  _updatedAt?: number;
  _version?: number;
  _deletedAt?: number;
};

export type Item = {
  __typename: string;
  givenUrl: string;
  resolvedId: string;
};

export enum PendingItemStatus {
  RESOLVED = 'RESOLVED',
  UNRESOLVED = 'UNRESOLVED',
}

export type PendingItem = {
  __typename: string;
  url: string;
  status?: PendingItemStatus;
};

export type SavedItem = RemoteEntity & {
  resolvedId: string;
  url: string;
  isFavorite: boolean;
  status: keyof typeof SavedItemStatus;
  favoritedAt?: number;
  isArchived: boolean;
  archivedAt?: number;
  item: {
    givenUrl: string;
  };
  tags?: Tag[];
};

export type TagConnection = {
  edges: TagEdge[];
  nodes: Tag[];
  pageInfo: PageInfo;
  totalCount: number;
};

export type Tag = RemoteEntity & {
  name: string;
  savedItems?: string[];
};

export type TagEdge = {
  cursor: string;
  node: Tag;
};

export type PaginationInput = {
  after?: string;
  before?: string;
  first?: number;
  last?: number;
};

export enum SavedItemsContentType {
  VIDEO = 'VIDEO',
  ARTICLE = 'ARTICLE',
}

export type SavedItemsFilter = {
  updatedSince?: number;
  isFavorite?: boolean;
  isArchived?: boolean;
  tagIds?: string[];
  tagNames?: string[];
  isHighlighted?: boolean;
  contentType?: SavedItemsContentType;
  status?: Exclude<SavedItemStatus, SavedItemStatus.DELETED>;
};

export enum SavedItemsSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum SavedItemsSortBy {
  CREATED_AT = 'CREATED_AT',
  UPDATED_AT = 'UPDATED_AT',
  FAVORITED_AT = 'FAVORITED_AT',
  ARCHIVED_AT = 'ARCHIVED_AT',
}

export type SavedItemsSort = {
  sortBy?: SavedItemsSortBy;
  sortOrder?: SavedItemsSortOrder;
};

export type SavedItemUpsertInput = {
  url: string;
  isFavorite?: boolean;
  timestamp?: number;
};

export const defaultPage = 30;
export const maxPageSize = 100;

/**
 * Keeping the arbitrary numbers consistent with this enum
 */
export enum SavedItemStatus {
  UNREAD = 0,
  ARCHIVED = 1,
  DELETED = 2,
  HIDDEN = 3,
}

export type TagCreateInput = {
  name: string;
  savedItemId: string;
};

export type DeleteSavedItemTagsInput = {
  savedItemId: string;
  tagIds: string[];
};

export type SavedItemTagAssociation = {
  savedItemId: string;
  tagId: string;
};

export type TagUpdateInput = {
  name: string;
  id: string;
};

export type SavedItemTagUpdateInput = {
  savedItemId: string;
  tagIds: string[];
};
