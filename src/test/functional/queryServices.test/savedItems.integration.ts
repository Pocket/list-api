import { readClient, writeClient } from '../../../database/client';
import { ApolloServer, gql } from 'apollo-server-express';
import { buildFederatedSchema } from '@apollo/federation';
import { typeDefs } from '../../../server/typeDefs';
import { resolvers } from '../../../resolvers';
import chai, { expect } from 'chai';
import { ContextManager } from '../../../server/context';
import chaiDateTime from 'chai-datetime';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';

chai.use(chaiDateTime);
chai.use(deepEqualInAnyOrder);

describe('getSavedItems', () => {
  const db = readClient();
  const server = new ApolloServer({
    schema: buildFederatedSchema({ typeDefs, resolvers }),
    context: ({ req }) => {
      return new ContextManager({
        request: {
          headers: { userid: '1', apiid: '0' },
        },
        db: {
          readClient: readClient(),
          writeClient: writeClient(),
        },
        eventEmitter: null,
      });
    },
  });

  // TODO: What date is the server running in? Web repo does central...
  // should this do UTC, this changes pagination cursors.
  const date1 = new Date('2020-10-03 10:20:30'); // Consistent date for seeding
  const date2 = new Date('2020-10-03 10:22:30'); // Consistent date for seeding
  const date3 = new Date('2020-10-03 10:25:30'); // Consistent date for seeding
  const nullDate = new Date('0000-00-00 00:00:00');

  const GET_SAVED_ITEMS = gql`
    query getSavedItem(
      $id: ID!
      $pagination: PaginationInput
      $sort: SavedItemsSort
    ) {
      _entities(representations: { id: $id, __typename: "User" }) {
        ... on User {
          savedItems(pagination: $pagination, sort: $sort) {
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
  `;

  afterAll(async () => {
    await db.destroy();
  });

  beforeAll(async () => {
    await db('list').truncate();
    await db('list').insert([
      {
        user_id: 1,
        item_id: 1,
        resolved_id: 1,
        given_url: 'http://abc',
        title: 'mytitle',
        time_added: date1,
        time_updated: date2,
        time_read: date1,
        time_favorited: nullDate,
        api_id: 'apiid',
        status: 1,
        favorite: 0,
        api_id_updated: 'apiid',
      },
      {
        user_id: 1,
        item_id: 2,
        resolved_id: 2,
        given_url: 'http://def',
        title: 'title2',
        time_added: date2,
        time_updated: date3,
        time_read: date2,
        time_favorited: date2,
        api_id: 'apiid',
        status: 0,
        favorite: 1,
        api_id_updated: 'apiid',
      },
      {
        user_id: 1,
        item_id: 3,
        resolved_id: 1,
        given_url: 'http://ijk',
        title: 'mytitle',
        time_added: date3,
        time_updated: date1,
        time_read: date3,
        time_favorited: date1,
        api_id: 'apiid',
        status: 0,
        favorite: 1,
        api_id_updated: 'apiid',
      },
    ]);
  });

  it('should resolve status field', async () => {
    const SAVED_ITEMS_FIELD = gql`
      query getSavedItem(
        $id: ID!
        $pagination: PaginationInput
        $sort: SavedItemsSort
      ) {
        _entities(representations: { id: $id, __typename: "User" }) {
          ... on User {
            savedItems(pagination: $pagination, sort: $sort) {
              edges {
                node {
                  status
                }
              }
            }
          }
        }
      }
    `;
    const variables = {
      id: '1',
      pagination: { first: 1 },
    };
    const res = await server.executeOperation({
      query: SAVED_ITEMS_FIELD,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data?._entities[0].savedItems.edges[0].node.status).to.equal(
      'UNREAD'
    );
  });

  it('should return a paginated list of most recently added items, with more next pages and all expected properties', async () => {
    const variables = {
      id: '1',
      pagination: { first: 2 },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.data?._entities[0].savedItems.totalCount).to.equal(3);
    expect(res.data?._entities[0].savedItems.edges.length).to.equal(2);
    expect(res.data?._entities[0].savedItems.edges[0].node.url).to.equal(
      'http://ijk'
    );
    expect(
      res.data?._entities[0].savedItems.edges[0].node.item.givenUrl
    ).to.equal('http://ijk');
    expect(res.data?._entities[0].savedItems.edges[1].node.url).to.equal(
      'http://def'
    );
    expect(
      res.data?._entities[0].savedItems.edges[1].node.item.givenUrl
    ).to.equal('http://def');
    expect(res.data?._entities[0].savedItems.pageInfo.hasNextPage).to.be.true;
    expect(res.data?._entities[0].savedItems.pageInfo.hasPreviousPage).to.be
      .false;
  });
  it('should finish the forward pagination from previous cursor, without overfetching', async () => {
    const variables = {
      id: '1',
      pagination: {
        after: 'Ml8qXzE2MDE3Mzg1NTA=',
        first: 2,
      },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.data?._entities[0].savedItems.edges.length).to.equal(1);
    expect(res.data?._entities[0].savedItems.edges[0].node.url).to.equal(
      'http://abc'
    );
    expect(
      res.data?._entities[0].savedItems.edges[0].node.item.givenUrl
    ).to.equal('http://abc');
    expect(res.data?._entities[0].savedItems.pageInfo.hasNextPage).to.be.false;
    expect(res.data?._entities[0].savedItems.pageInfo.hasPreviousPage).to.be
      .true;
    expect(res.data?._entities[0].savedItems.pageInfo.startCursor).to.be.not
      .undefined;
    expect(res.data?._entities[0].savedItems.pageInfo.endCursor).to.be.not
      .undefined;
  });

  it('should paginate backwards, returning the least recently added items', async () => {
    // Note the order is still sorted on time_added desc (default), so it's more like
    // a slice is taken from the bottom of the stack rather than the top
    const variables = {
      id: '1',
      pagination: {
        last: 2,
      },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.data?._entities[0].savedItems.edges.length).to.equal(2);
    expect(res.data?._entities[0].savedItems.pageInfo.hasNextPage).to.be.false;
    expect(res.data?._entities[0].savedItems.pageInfo.hasPreviousPage).to.be
      .true;
    expect(res.data?._entities[0].savedItems.edges[0].node.url).to.equal(
      'http://def'
    );
    expect(res.data?._entities[0].savedItems.edges[1].node.url).to.equal(
      'http://abc'
    );
  });

  it('should finish the backward pagination from the previous cursor, without overfetching', async () => {
    // The top of the stack is the last page when paginating in reverse
    const variables = {
      id: '1',
      pagination: {
        before: 'Ml8qXzE2MDE3Mzg1NTA=',
        last: 2,
      },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.data?._entities[0].savedItems.edges.length).to.equal(1);
    expect(
      res.data?._entities[0].savedItems.edges[0].node.item.givenUrl
    ).to.equal('http://ijk');
    expect(res.data?._entities[0].savedItems.pageInfo.hasPreviousPage).to.be
      .false;
    expect(res.data?._entities[0].savedItems.pageInfo.hasNextPage).to.be.true;
  });

  it('can resolve a entity query for a SavedItem by Id', async () => {
    const RESOLVE_REFERENCE_QUERY = gql`
      query ($_representations: [_Any!]!) {
        _entities(representations: $_representations) {
          ... on SavedItem {
            id
          }
        }
      }
    `;

    const variables = {
      _representations: [
        {
          __typename: 'SavedItem',
          id: '1',
        },
        {
          __typename: 'SavedItem',
          id: '2',
        },
      ],
    };

    const res = await server.executeOperation({
      query: RESOLVE_REFERENCE_QUERY,
      variables,
    });

    expect(res.data._entities[0].id).to.equal('1');
    expect(res.data._entities[1].id).to.equal('2');
  });

  it('can resolve a entity query for a SavedItem by Url', async () => {
    const RESOLVE_REFERENCE_QUERY = gql`
      query ($_representations: [_Any!]!) {
        _entities(representations: $_representations) {
          ... on SavedItem {
            url
          }
        }
      }
    `;

    const variables = {
      _representations: [
        {
          __typename: 'SavedItem',
          url: 'http://abc',
        },
        {
          __typename: 'SavedItem',
          url: 'http://def',
        },
      ],
    };

    const res = await server.executeOperation({
      query: RESOLVE_REFERENCE_QUERY,
      variables,
    });

    expect(res.data._entities[0].url).to.equal('http://abc');
    expect(res.data._entities[1].url).to.equal('http://def');
  });

  describe('sort', () => {
    const GET_SAVED_ITEMS_SORT = gql`
      query getSavedItem(
        $id: ID!
        $pagination: PaginationInput
        $sort: SavedItemsSort
      ) {
        _entities(representations: { id: $id, __typename: "User" }) {
          ... on User {
            savedItems(pagination: $pagination, sort: $sort) {
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
              }
            }
          }
        }
      }
    `;

    it('"first, descending" should equal "last, ascending" in reverse order', async () => {
      const variables = {
        id: '1',
        pagination: { first: 2 },
        sort: { sortBy: 'CREATED_AT', sortOrder: 'DESC' },
      };
      const compareVars = {
        id: '1',
        pagination: { last: 2 },
        sort: { sortBy: 'CREATED_AT', sortOrder: 'ASC' },
      };
      const res = await server.executeOperation({
        query: GET_SAVED_ITEMS_SORT,
        variables,
      });
      const compareRes = await server.executeOperation({
        query: GET_SAVED_ITEMS_SORT,
        variables: compareVars,
      });
      expect(res.errors).to.be.undefined;
      expect(res.data).to.be.not.undefined;
      expect(res.data?._entities[0].savedItems.edges.length)
        .to.equal(2)
        .and.to.equal(compareRes.data?._entities[0].savedItems.edges.length);
      expect(res.data?._entities[0].savedItems.edges[0]).to.deep.equal(
        compareRes.data?._entities[0].savedItems.edges[1]
      );
      expect(res.data?._entities[0].savedItems.edges[1]).to.deep.equal(
        compareRes.data?._entities[0].savedItems.edges[0]
      );
      expect(res.data._entities[0].savedItems.pageInfo.startCursor).to.equal(
        compareRes.data._entities[0].savedItems.pageInfo.endCursor
      );
      expect(res.data._entities[0].savedItems.pageInfo.endCursor).to.equal(
        compareRes.data._entities[0].savedItems.pageInfo.startCursor
      );
    });
    test.each([
      {
        sortBy: 'CREATED_AT',
        sortOrder: 'DESC',
        expectedUrls: ['http://ijk', 'http://def'],
      },
      {
        sortBy: 'CREATED_AT',
        sortOrder: 'ASC',
        expectedUrls: ['http://abc', 'http://def'],
      },
      {
        sortBy: 'UPDATED_AT',
        sortOrder: 'DESC',
        expectedUrls: ['http://def', 'http://abc'],
      },
      {
        sortBy: 'UPDATED_AT',
        sortOrder: 'ASC',
        expectedUrls: ['http://ijk', 'http://abc'],
      },
      {
        sortBy: 'FAVORITED_AT',
        sortOrder: 'DESC',
        expectedUrls: ['http://def', 'http://ijk'],
      },
      {
        sortBy: 'FAVORITED_AT',
        // Note that this will put non-favorite items first (since they are set to time 0)
        sortOrder: 'ASC',
        expectedUrls: ['http://abc', 'http://ijk'],
      },
      {
        sortBy: 'ARCHIVED_AT',
        sortOrder: 'DESC',
        expectedUrls: ['http://abc', 'http://ijk'],
      },
      {
        sortBy: 'ARCHIVED_AT',
        // Note that this will put non-archived items first (since they are set to time 0)
        sortOrder: 'ASC',
        expectedUrls: ['http://def', 'http://ijk'],
      },
    ])(
      ' by $sortBy, $sortOrder works',
      async ({ sortBy, sortOrder, expectedUrls }) => {
        const variables = {
          id: '1',
          pagination: { first: 2 },
          sort: { sortBy: sortBy, sortOrder: sortOrder },
        };
        const res = await server.executeOperation({
          query: GET_SAVED_ITEMS_SORT,
          variables,
        });
        expect(res.errors).to.be.undefined;
        const urls = res.data?._entities[0].savedItems.edges.map(
          (edge) => edge.node.item.givenUrl
        );
        expect(expectedUrls).to.deep.equal(urls);
      }
    );
  });
});
