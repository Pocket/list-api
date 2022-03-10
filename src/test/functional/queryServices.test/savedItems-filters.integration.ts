import { readClient, writeClient } from '../../../database/client';
import { ApolloServer, gql } from 'apollo-server-express';
import { buildFederatedSchema } from '@apollo/federation';
import { typeDefs } from '../../../server/typeDefs';
import { resolvers } from '../../../resolvers';
import chai, { expect } from 'chai';
import { ContextManager } from '../../../server/context';
import chaiDateTime from 'chai-datetime';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import { getUnixTimestamp } from '../../../utils';

chai.use(chaiDateTime);
chai.use(deepEqualInAnyOrder);

describe('getSavedItems filter', () => {
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
  const date2Unix = getUnixTimestamp(date2); // Consistent date for seeding
  const date3 = new Date('2020-10-03 10:25:30'); // Consistent date for seeding

  const GET_SAVED_ITEMS = gql`
    query getSavedItem($id: ID!, $filter: SavedItemsFilter) {
      _entities(representations: { id: $id, __typename: "User" }) {
        ... on User {
          savedItems(pagination: { first: 30 }, filter: $filter) {
            totalCount
            pageInfo {
              startCursor
              endCursor
              hasNextPage
              hasPreviousPage
            }
            edges {
              node {
                url
                item {
                  ... on Item {
                    savedItem {
                      id
                      status
                      isFavorite
                      tags {
                        name
                      }
                    }
                  }
                }
              }
            }
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
        time_updated: date1,
        time_read: date1,
        time_favorited: date1,
        api_id: 'apiid',
        status: 0,
        favorite: 1,
        api_id_updated: 'apiid',
      },
      {
        user_id: 1,
        item_id: 2,
        resolved_id: 2,
        given_url: 'http://def',
        title: 'title2',
        time_added: date2,
        time_updated: date2,
        time_read: date2,
        time_favorited: date2,
        api_id: 'apiid',
        status: 1,
        favorite: 1,
        api_id_updated: 'apiid',
      },
      {
        user_id: 1,
        item_id: 3,
        resolved_id: 3,
        given_url: 'http://ijk',
        title: 'mytitle',
        time_added: date3,
        time_updated: date3,
        time_read: date3,
        time_favorited: date3,
        api_id: 'apiid',
        status: 2,
        favorite: 0,
        api_id_updated: 'apiid',
      },
    ]);

    await db('item_tags').truncate();
    await db('item_tags').insert([
      {
        user_id: 1,
        item_id: 1,
        tag: 'recipe',
        time_added: date1,
        time_updated: date1,
      },
      {
        user_id: 1,
        item_id: 1,
        tag: 'tofu',
        time_added: date1,
        time_updated: date1,
      },
      {
        user_id: 1,
        item_id: 2,
        tag: 'recipe',
        time_added: date1,
        time_updated: date1,
      },
    ]);
    await db('user_annotations').truncate();
    await db('user_annotations').insert([
      {
        user_id: 1,
        item_id: 1,
        annotation_id: 1,
        status: 1,
      },
      {
        user_id: 1,
        item_id: 1,
        annotation_id: 2,
        status: 1,
      },
      {
        user_id: 1,
        item_id: 2,
        annotation_id: 3,
        status: 0, // deleted highlight
      },
    ]);
    await db.raw('TRUNCATE TABLE readitla_b.items_extended');
    await db
      .insert([
        {
          extended_item_id: 1,
          video: 1,
          is_article: 0,
        },
        {
          extended_item_id: 2,
          video: 0,
          is_article: 1,
        },
        {
          extended_item_id: 3,
          video: 0,
          is_article: 1,
        },
      ])
      .into(`readitla_b.items_extended`);
  });

  it('should return untagged items', async () => {
    const variables = {
      id: '1',
      filter: { tagNames: ['_untagged_'] },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data._entities[0].savedItems.edges.length).to.equal(1);
    expect(res.data?._entities[0].savedItems.edges[0].node.url).to.equal(
      'http://ijk'
    );
    expect(
      res.data?._entities[0].savedItems.edges[0].node.item.savedItem.tags.length
    ).to.equal(0);
  });

  it('should return items with a specific tag', async () => {
    const variables = {
      id: '1',
      filter: { tagNames: ['tofu'] },
    };
    const tags = [{ name: 'tofu' }, { name: 'recipe' }];
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data._entities[0].savedItems.edges.length).to.equal(1);
    expect(res.data?._entities[0].savedItems.edges[0].node.url).to.equal(
      'http://abc'
    );
    expect(
      res.data?._entities[0].savedItems.edges[0].node.item.savedItem.tags.length
    ).to.equal(2);
    expect(
      res.data?._entities[0].savedItems.edges[0].node.item.savedItem.tags
    ).to.deep.equalInAnyOrder(tags);
  });

  it('should return items with a list of specified tags', async () => {
    const variables = {
      id: '1',
      filter: { tagNames: ['recipe', 'tofu'] },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data._entities[0].savedItems.edges.length).to.equal(2);
    const actualTags = res.data._entities[0].savedItems.edges.map(
      (edge) => edge.node.item.savedItem.tags
    );
    expect(actualTags).to.deep.equalInAnyOrder([
      [{ name: 'tofu' }, { name: 'recipe' }],
      [{ name: 'recipe' }],
    ]);
  });

  it('should return archived items', async () => {
    const variables = {
      id: '1',
      filter: { isArchived: true },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data._entities[0].savedItems.edges.length).to.equal(1);
    expect(
      res.data._entities[0].savedItems.edges[0].node.item.savedItem.status
    ).to.equal('ARCHIVED');
  });
  it('should return non-archived items', async () => {
    const variables = {
      id: '1',
      filter: { isArchived: false },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data?._entities[0].savedItems.edges.length).to.equal(2);
    res.data?._entities[0].savedItems.edges.forEach((edge) => {
      expect(edge.node.item.savedItem.status).to.not.equal('ARCHIVED');
    });
  });

  it('should return items updated since a specific time', async () => {
    const variables = {
      id: '1',
      filter: { updatedSince: date2Unix },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data?._entities[0].savedItems.edges.length).to.equal(1);
    expect(res.data?._entities[0].savedItems.edges[0].node.url).to.equal(
      'http://ijk'
    );
  });

  it('should return favorited items', async () => {
    const variables = {
      id: '1',
      filter: { isFavorite: true },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data?._entities[0].savedItems.edges.length).to.equal(2);
    res.data?._entities[0].savedItems.edges.forEach((edge) => {
      expect(edge.node.item.savedItem.isFavorite).to.equal(true);
    });
  });

  it('should return non-favorited items', async () => {
    const variables = {
      id: '1',
      filter: { isFavorite: false },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data?._entities[0].savedItems.edges.length).to.equal(1);
    expect(
      res.data?._entities[0].savedItems.edges[0].node.item.savedItem.isFavorite
    ).to.equal(false);
  });

  it('should not throw an error if no items match the filters', async () => {
    const variables = {
      id: '1',
      filter: {
        isHighlighted: true,
        contentType: 'VIDEO',
        isFavorite: false,
        status: 'ARCHIVED',
      },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data?._entities[0].savedItems.edges).to.deep.equal([]);
    expect(res.data?._entities[0].savedItems.totalCount).to.equal(0);
    expect(res.data?._entities[0].savedItems.pageInfo).to.deep.equal({
      startCursor: null,
      endCursor: null,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it('should return highlighted items with active (non-deleted) highlights only', async () => {
    const variables = {
      id: '1',
      filter: { isHighlighted: true },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data?._entities[0].savedItems.edges.length).to.equal(1);
    expect(res.data?._entities[0].savedItems.edges[0].node.url).to.equal(
      'http://abc'
    );
  });

  it('should return non-highlighted items (or items with only deleted highlights)', async () => {
    const variables = {
      id: '1',
      filter: { isHighlighted: false },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data?._entities[0].savedItems.edges.length).to.equal(2);
    res.data?._entities[0].savedItems.edges.forEach((edge) => {
      expect(edge.node.url).to.be.oneOf(['http://ijk', 'http://def']);
    });
  });

  it('should return articles', async () => {
    const variables = {
      id: '1',
      filter: { contentType: 'ARTICLE' },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    const edges = res.data?._entities[0].savedItems.edges;
    expect(edges.length).to.equal(2);
    const actualIds = edges.map((edge) => edge.node.item.savedItem.id);
    expect(actualIds).to.deep.equalInAnyOrder(['2', '3']);
  });
  it('should return videos', async () => {
    const variables = {
      id: '1',
      filter: { contentType: 'VIDEO' },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data?._entities[0].savedItems.edges.length).to.equal(1);
    expect(
      res.data?._entities[0].savedItems.edges[0].node.item.savedItem.id
    ).to.equal('1');
  });

  it('should return items by status', async () => {
    const variables = {
      id: '1',
      filter: { status: 'ARCHIVED' },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data?._entities[0].savedItems.edges.length).to.equal(1);
    expect(
      res.data?._entities[0].savedItems.edges[0].node.item.savedItem.id
    ).to.equal('2');
  });
  it('should use states to return multiple statuses', async () => {
    const variables = {
      id: '1',
      filter: { states: ['UNREAD', 'ARCHIVED'] },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data?._entities[0].savedItems.edges.length).to.equal(2);
    expect(
      res.data?._entities[0].savedItems.edges.map(
        (edge) => edge.node.item.savedItem.id
      )
    ).to.deep.equalInAnyOrder(['1', '2']); // Don't care about sort for this test
  });

  it('should be combined with other filters properly', async () => {
    const variables = {
      id: '1',
      filter: {
        isFavorite: true,
        updatedSince: getUnixTimestamp(new Date('2020-10-02 10:20:30')),
        isArchived: false,
        isHighlighted: true,
        tagNames: ['recipe', '_untagged_'],
      },
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEMS,
      variables,
    });
    expect(res.errors).to.be.undefined;
    expect(res.data?._entities[0].savedItems.edges.length).to.equal(1);
    expect(
      res.data?._entities[0].savedItems.edges[0].node.item.savedItem.isFavorite
    ).to.equal(true);
    expect(
      res.data?._entities[0].savedItems.edges[0].node.item.savedItem.status
    ).to.not.equal('ARCHIVED');
    expect(res.data?._entities[0].savedItems.edges[0].node.url).to.equal(
      'http://abc'
    );
  });
});
