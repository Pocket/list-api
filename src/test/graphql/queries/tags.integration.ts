import { readClient } from '../../../database/client';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import sinon from 'sinon';
import * as tagsDataLoader from '../../../dataLoader/tagsDataLoader';
import config from '../../../config';
import { ContextManager } from '../../../server/context';
import { startServer } from '../../../server/apollo';
import { Express } from 'express';
import { ApolloServer } from '@apollo/server';
import request from 'supertest';

chai.use(chaiDateTime);

describe('tags query tests - happy path', () => {
  const db = readClient();
  const headers = { userid: '1', premium: 'true' };
  const date = new Date('2020-10-03T10:20:30.000Z');
  const date1 = new Date('2021-10-03T10:20:30.000Z');
  const date2 = new Date('2022-10-03T10:20:30.000Z');
  const date3 = new Date('2023-10-03T10:20:30.000Z');
  let app: Express;
  let server: ApolloServer<ContextManager>;
  let url: string;

  const GET_TAG_CONNECTION = `
    query getTags($id: ID!, $pagination: PaginationInput) {
      _entities(representations: { id: $id, __typename: "User" }) {
        ... on User {
          tags(pagination: $pagination) {
            edges {
              cursor
              node {
                id
                name
                _deletedAt
                _version
              }
            }
            pageInfo {
              startCursor
              endCursor
              hasNextPage
              hasPreviousPage
            }
            totalCount
          }
        }
      }
    }
  `;

  afterAll(async () => {
    await db.destroy();
    await server.stop();
  });

  beforeAll(async () => {
    ({ app, server, url } = await startServer(0));

    await db('list').truncate();
    await db('item_tags').truncate();
    await db('readitla_b.item_grouping').truncate();
    await db('readitla_b.grouping').truncate();

    await db('list').insert([
      {
        user_id: 1,
        item_id: 1,
        resolved_id: 1,
        given_url: 'http://abc',
        title: 'mytitle',
        time_added: date,
        time_updated: date,
        time_read: date,
        time_favorited: date,
        api_id: 'apiid',
        status: 1,
        favorite: 1,
        api_id_updated: 'apiid',
      },
      {
        user_id: 1,
        item_id: 2,
        resolved_id: 2,
        given_url: 'http://tagtest',
        title: 'tagstest',
        time_added: date,
        time_updated: date,
        time_read: date,
        time_favorited: date1,
        api_id: '0',
        status: 0,
        favorite: 1,
        api_id_updated: '0',
      },
      {
        user_id: 1,
        item_id: 3,
        resolved_id: 3,
        given_url: 'http://winter.sports',
        title: 'winter sports',
        time_added: date,
        time_updated: date,
        time_read: date,
        time_favorited: date2,
        api_id: '0',
        status: 1,
        favorite: 1,
        api_id_updated: '0',
      },
      {
        user_id: 1,
        item_id: 4,
        resolved_id: 4,
        given_url: 'http://summer.sports',
        title: 'summer sports',
        time_added: date,
        time_updated: date,
        time_read: date,
        time_favorited: date3,
        api_id: '0',
        status: 1,
        favorite: 1,
        api_id_updated: '0',
      },
      {
        user_id: 2,
        item_id: 99,
        resolved_id: 99,
        given_url: 'http://fall.sports',
        title: 'fall sports',
        time_added: date,
        time_updated: date,
        time_read: date,
        time_favorited: date3,
        api_id: '0',
        status: 1,
        favorite: 1,
        api_id_updated: '0',
      },
    ]);

    await db('item_tags').insert([
      {
        user_id: 1,
        item_id: 1,
        tag: 'zebra',
        status: 1,
        time_added: date1,
        time_updated: date1,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 1,
        item_id: 1,
        tag: 'travel',
        status: 1,
        time_added: date,
        time_updated: date,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 1,
        item_id: 2,
        tag: 'travel',
        status: 1,
        time_added: date1,
        time_updated: date1,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 1,
        item_id: 3,
        tag: 'travel',
        status: 1,
        time_added: date1,
        time_updated: date1,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 1,
        item_id: 4,
        tag: 'travel',
        status: 1,
        time_added: date1,
        time_updated: date1,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 1,
        item_id: 5,
        tag: 'travel',
        status: 1,
        time_added: date1,
        time_updated: date1,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 1,
        item_id: 2,
        tag: 'adventure',
        status: 1,
        time_added: date,
        time_updated: date,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 2,
        item_id: 2,
        tag: 'dontfetch',
        status: 1,
        time_added: date,
        time_updated: date,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 1,
        item_id: 3,
        tag: 'adventure',
        status: 1,
        time_added: date,
        time_updated: date,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 1,
        item_id: 4,
        tag: 'adventure',
        status: 1,
        time_added: date,
        time_updated: date,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 1,
        item_id: 5,
        tag: 'adventure',
        status: 1,
        time_added: date,
        time_updated: date,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 1,
        item_id: 6,
        tag: 'adventure',
        status: 1,
        time_added: date,
        time_updated: date,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },

      {
        user_id: 1,
        item_id: 7,
        tag: 'adventure',
        status: 1,
        time_added: date,
        time_updated: date,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
      {
        user_id: 2,
        item_id: 99,
        tag: '',
        status: 1,
        time_added: date,
        time_updated: date,
        api_id: 'apiid',
        api_id_updated: 'updated_api_id',
      },
    ]);
  });

  const GET_TAGS_FOR_SAVED_ITEM = `
    query getSavedItem($userId: ID!, $itemId: ID!) {
      _entities(representations: { id: $userId, __typename: "User" }) {
        ... on User {
          savedItemById(id: $itemId) {
            url
            tags {
              ... on Tag {
                id
                name
                _version
                _deletedAt
                savedItems {
                  edges {
                    cursor
                    node {
                      url
                      item {
                        ... on Item {
                          givenUrl
                        }
                      }
                    }
                  }
                  pageInfo {
                    startCursor
                    endCursor
                    hasNextPage
                    hasPreviousPage
                  }
                  totalCount
                }
              }
            }
          }
        }
      }
    }
  `;

  const GET_TAGS_SAVED_ITEMS = `
    query getTags(
      $id: ID!
      $pagination: PaginationInput
      $itemPagination: PaginationInput
      $filter: SavedItemsFilter
      $sort: SavedItemsSort
    ) {
      _entities(representations: { id: $id, __typename: "User" }) {
        ... on User {
          tags(pagination: $pagination) {
            edges {
              cursor
              node {
                id
                name
                savedItems(
                  pagination: $itemPagination
                  filter: $filter
                  sort: $sort
                ) {
                  edges {
                    cursor
                    node {
                      url
                      item {
                        ... on Item {
                          givenUrl
                        }
                      }
                    }
                  }
                  pageInfo {
                    startCursor
                    endCursor
                    hasNextPage
                    hasPreviousPage
                  }
                  totalCount
                }
              }
            }
            pageInfo {
              startCursor
              endCursor
              hasNextPage
              hasPreviousPage
            }
            totalCount
          }
        }
      }
    }
  `;

  it('return list of Tags and paginated savedItems for SavedItem', async () => {
    const variables = {
      userId: '1',
      itemId: '1',
    };

    const res = await request(app).post(url).set(headers).send({
      query: GET_TAGS_FOR_SAVED_ITEM,
      variables,
    });
    expect(res.body.data?._entities[0].savedItemById.url).to.equal(
      'http://abc'
    );
    expect(res.body.data?._entities[0].savedItemById.tags[0].name).to.equal(
      'travel'
    );
    expect(res.body.data?._entities[0].savedItemById.tags[0].id).to.equal(
      'dHJhdmVsX194cGt0eHRhZ3hfXw=='
    );
    expect(res.body.data?._entities[0].savedItemById.tags[0]._version).is.null;
    expect(res.body.data?._entities[0].savedItemById.tags[0]._deletedAt).is
      .null;
    expect(res.body.data?._entities[0].savedItemById.tags[1].name).to.equal(
      'zebra'
    );
    expect(res.body.data?._entities[0].savedItemById.tags[1].id).to.equal(
      'emVicmFfX3hwa3R4dGFneF9f'
    );
    expect(res.body.data?._entities[0].savedItemById.tags[1]._deletedAt).is
      .null;
    expect(res.body.data?._entities[0].savedItemById.tags[1]._deletedAt).is
      .null;
    expect(
      res.body.data?._entities[0].savedItemById.tags[0].savedItems.edges.length
    ).equals(4);
    // Default to itemId, asc on sort field collision
    expect(
      res.body.data?._entities[0].savedItemById.tags[0].savedItems.edges[0].node
        .url
    ).equals('http://abc');
    expect(
      res.body.data?._entities[0].savedItemById.tags[0].savedItems.totalCount
    ).equals(4);
    expect(
      res.body.data?._entities[0].savedItemById.tags[0].savedItems.pageInfo
        .hasNextPage
    ).is.false;
    expect(
      res.body.data?._entities[0].savedItemById.tags[0].savedItems.pageInfo
        .hasPreviousPage
    ).is.false;
  });

  describe('should not allow before/after pagination', () => {
    it('for array response', async () => {
      const variables = {
        userId: '1',
        itemId: '1',
        pagination: { before: 'emVicmFfKl8iemVicmEi', last: 10 },
      };

      const GET_PAGINATED_ITEMS = `
        query getSavedItem(
          $userId: ID!
          $itemId: ID!
          $pagination: PaginationInput
        ) {
          _entities(representations: { id: $userId, __typename: "User" }) {
            ... on User {
              savedItemById(id: $itemId) {
                tags {
                  ... on Tag {
                    savedItems(pagination: $pagination) {
                      totalCount
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const res = await request(app).post(url).set(headers).send({
        query: GET_PAGINATED_ITEMS,
        variables,
      });
      expect(res.body.errors.length).to.be.above(0);
      expect(res.body.errors[0].message).to.equal(
        'Cannot specify a cursor on a nested paginated field.'
      );
    });
    it('under paginated Tags', async () => {
      const variables = {
        id: '1',
        pagination: { first: 2 },
        sort: { sortBy: 'CREATED_AT', sortOrder: 'ASC' },
        itemPagination: { first: 2, after: 'somecursor' },
      };
      const res = await request(app).post(url).set(headers).send({
        query: GET_TAGS_SAVED_ITEMS,
        variables,
      });
      expect(res.body.errors.length).to.be.above(0);
      expect(res.body.errors[0].message).to.equal(
        'Cannot specify a cursor on a nested paginated field.'
      );
    });
  });

  it('return list of paginated SavedItems for Tags', async () => {
    const variables = {
      id: '1',
      pagination: { first: 2 },
      sort: { sortBy: 'CREATED_AT', sortOrder: 'ASC' },
      itemPagination: { first: 2 },
    };

    const res = await request(app).post(url).set(headers).send({
      query: GET_TAGS_SAVED_ITEMS,
      variables,
    });

    const tags = res.body.data?._entities[0].tags;
    // Returns 2 tags, but there are 3 total active
    expect(tags.edges.length).to.equal(2);
    expect(tags.pageInfo.hasNextPage).to.be.true;
    expect(tags.totalCount).to.equal(3);

    // since tags collide on createdAt, default to alphabetical ascending sort on name
    const firstTag = tags.edges[0].node;
    const secondTag = tags.edges[1].node;
    expect(firstTag.name).to.equal('adventure');
    expect(secondTag.name).to.equal('travel');

    expect(firstTag.savedItems.edges.length).to.equal(2);
    // all SavedItems collide on createdAt, so default to ascending by itemId
    expect(
      firstTag.savedItems.edges.map((edge) => edge.node.url)
    ).to.deep.equal(['http://tagtest', 'http://winter.sports']);
    expect(firstTag.savedItems.pageInfo.hasNextPage).to.be.true;
    expect(firstTag.savedItems.totalCount).to.equal(3);

    expect(secondTag.savedItems.edges.length).to.equal(2);
    expect(
      secondTag.savedItems.edges.map((edge) => edge.node.url)
    ).to.deep.equal(['http://abc', 'http://tagtest']);
    expect(secondTag.savedItems.pageInfo.hasNextPage).to.be.true;
  });

  it('return paginated SavedItems, when filtered by archived', async () => {
    const variables = {
      id: '1',
      pagination: { first: 1 },
      itemPagination: { last: 10 },
      sort: { sortBy: 'CREATED_AT', sortOrder: 'ASC' },
      filter: { isArchived: true },
    };

    const res = await request(app).post(url).set(headers).send({
      query: GET_TAGS_SAVED_ITEMS,
      variables,
    });
    // tags are sorted alphabetically, ascending
    expect(res.body.data?._entities[0].tags.edges[0].node.name).to.equal(
      'adventure'
    );
    const tag = res.body.data?._entities[0].tags.edges[0].node;
    // There are two archived SavedItems under adventure Tag
    expect(tag.savedItems.edges.length).to.equal(2);
    // sorted by createdAt, ascending (collision defaults to itemId)
    expect(tag.savedItems.edges.map((edge) => edge.node.url)).to.deep.equal([
      'http://winter.sports',
      'http://summer.sports',
    ]);
    expect(tag.savedItems.totalCount).to.equal(2);
    expect(tag.savedItems.pageInfo.hasNextPage).to.be.false;
    expect(tag.savedItems.pageInfo.hasPreviousPage).to.be.false;
  });

  it('should return list of Tags for User for first n values', async () => {
    const variables = {
      id: '1',
      pagination: { first: 2 },
    };

    const res = await request(app).post(url).set(headers).send({
      query: GET_TAG_CONNECTION,
      variables,
    });

    expect(res.body.data?._entities[0].tags.totalCount).to.equal(3);
    expect(res.body.data?._entities[0].tags.pageInfo.hasNextPage).is.true;
    expect(res.body.data?._entities[0].tags.pageInfo.hasPreviousPage).is.false;
    expect(res.body.data?._entities[0].tags.edges.length).to.equal(2);
    expect(res.body.data?._entities[0].tags.edges[0].node.name).to.equal(
      'adventure'
    );
    expect(res.body.data?._entities[0].tags.edges[0].node.id).to.equal(
      'YWR2ZW50dXJlX194cGt0eHRhZ3hfXw=='
    );
    expect(res.body.data?._entities[0].tags.edges[1].node.name).to.equal(
      'travel'
    );
  });

  it('should return list of Tags for User for last n values', async () => {
    const variables = {
      id: '1',
      pagination: { last: 2 },
    };

    const res = await request(app).post(url).set(headers).send({
      query: GET_TAG_CONNECTION,
      variables,
    });

    expect(res.body.data?._entities[0].tags.totalCount).to.equal(3);
    expect(res.body.data?._entities[0].tags.pageInfo.hasPreviousPage).is.true;
    expect(res.body.data?._entities[0].tags.pageInfo.hasNextPage).is.false;
    expect(res.body.data?._entities[0].tags.edges.length).to.equal(2);
    expect(res.body.data?._entities[0].tags.edges[0].node.name).to.equal(
      'travel'
    );
  });

  it('should return list of Tags for User for first n values after the given cursor', async () => {
    const variables = {
      id: '1',
      pagination: { first: 2, after: 'YWR2ZW50dXJlXypfImFkdmVudHVyZSI=' },
    };

    const res = await request(app).post(url).set(headers).send({
      query: GET_TAG_CONNECTION,
      variables,
    });

    expect(res.body.data?._entities[0].tags.totalCount).to.equal(3);
    expect(res.body.data?._entities[0].tags.pageInfo.hasNextPage).is.false;
    expect(res.body.data?._entities[0].tags.pageInfo.hasPreviousPage).is.true;
    expect(res.body.data?._entities[0].tags.edges.length).to.equal(2);
    expect(res.body.data?._entities[0].tags.edges[0].node.name).to.equal(
      'travel'
    );
  });

  it('should return list of Tags for User for last n values before the given cursor', async () => {
    const variables = {
      id: '1',
      pagination: { last: 2, before: 'emVicmFfKl8iemVicmEi' },
    };

    const res = await request(app).post(url).set(headers).send({
      query: GET_TAG_CONNECTION,
      variables,
    });

    expect(res.body.data?._entities[0].tags.totalCount).to.equal(3);
    expect(res.body.data?._entities[0].tags.pageInfo.hasNextPage).is.true;
    expect(res.body.data?._entities[0].tags.pageInfo.hasPreviousPage).is.false;
    expect(res.body.data?._entities[0].tags.edges.length).to.equal(2);
    expect(res.body.data?._entities[0].tags.edges[1].node.name).to.equal(
      'travel'
    );
  });

  it('should not overflow when first is greater than available item', async () => {
    const variables = {
      id: '1',
      pagination: { first: 2, after: 'dHJhdmVsXypfInRyYXZlbCI=' },
    };

    const res = await request(app).post(url).set(headers).send({
      query: GET_TAG_CONNECTION,
      variables,
    });

    expect(res.body.data?._entities[0].tags.totalCount).to.equal(3);
    expect(res.body.data?._entities[0].tags.pageInfo.hasNextPage).is.false;
    expect(res.body.data?._entities[0].tags.pageInfo.hasPreviousPage).is.true;
    expect(res.body.data?._entities[0].tags.edges.length).to.equal(1);
    expect(res.body.data?._entities[0].tags.edges[0].node.name).to.equal(
      'zebra'
    );
  });
  it('should resolve tag fields from the parent if provided', async () => {
    const dataLoaderSpy = sinon.spy(tagsDataLoader, 'batchGetTagsByNames');
    const variables = {
      id: '1',
      pagination: { first: 2 },
    };

    await request(app).post(url).set(headers).send({
      query: GET_TAG_CONNECTION,
      variables,
    });
    expect(dataLoaderSpy.callCount).to.equal(0);
    dataLoaderSpy.restore();
  });
  it('should allow returning empty tags', async () => {
    const variables = {
      userId: '2',
      itemId: '99',
    };

    const res = await request(app)
      .post(url)
      .set({ ...headers, userid: '2' })
      .send({
        query: GET_TAGS_FOR_SAVED_ITEM,
        variables,
      });
    const save = res.body.data?._entities[0].savedItemById;
    expect(save.url).to.equal('http://fall.sports');
    expect(save.tags.length).to.equal(1);
    expect(save.tags[0].name).to.equal('');
    expect(save.tags[0].id).to.equal(
      Buffer.from(config.data.tagIdSuffix).toString('base64')
    );
    expect(res.body.errors).to.be.undefined;
  });
});
