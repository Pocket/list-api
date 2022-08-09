import { readClient } from '../../../database/client';
import { gql } from 'apollo-server-express';
import { getServer } from '../testServerUtil';

describe('openView', () => {
  const db = readClient();
  const server = getServer('1', db, null);

  const date = new Date('2020-10-03 10:20:30'); // Consistent date for seeding
  const date1 = new Date('2020-10-03 10:30:30'); // Consistent date for seeding

  const GET_SAVED_ITEM = (itemRepresentation: {
    __typename: 'Item';
    isArticle: boolean;
    article: string;
    url: string;
  }) => {
    const { __typename, isArticle, article, url } = itemRepresentation
    return gql`
      query getSavedItem($userId: ID!, $itemId: ID!) {
        _entities(
          representations: [
            { id: $userId, __typename: "User" }
            { id: $itemId, __typename: "${__typename}", article: "${article}", isArticle: "${isArticle}", url: "${url}"}
          ]
        ) {
          ... on User {
            savedItemById(id: $itemId) {
              id
              openView {
                __typename
                ... on WebView {
                  url
                }
                ... on ArticleView {
                  articleHTML
                }
              }
            }
          }
        }
      }
    `;
  };

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
        time_added: date,
        time_updated: date1,
        time_read: date,
        time_favorited: date,
        api_id: 'apiid',
        status: 0,
        favorite: 1,
        api_id_updated: 'apiid',
      },
    ]);
  });

  it('should return articleHTML if isArticle=true on underlying item', async () => {
    const itemRep = {
      __typename: 'Item' as const,
      isArticle: true,
      article: '<html></html>',
      url: 'https://www.youtube.com/watch?v=lcOxhH8N3Bo',
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEM(itemRep),
      variables: {
        userId: '1',
        itemId: '1',
      },
    });
    const expectedView = {
      __typename: 'ArticleView',
      articleHTML: itemRep.article,
    };
    expect(res.errors).toBeFalsy();
    expect(res.data?._entities[0].savedItemById.openView).toEqual(expectedView);
  });
  it('should return url if isArticle=false on underlying item', async () => {
    const itemRep = {
      __typename: 'Item' as const,
      isArticle: false,
      article: '<html></html>',
      url: 'https://www.youtube.com/watch?v=lcOxhH8N3Bo',
    };
    const expectedView = {
      __typename: 'WebView',
      url: itemRep.url,
    };
    const res = await server.executeOperation({
      query: GET_SAVED_ITEM(itemRep),
      variables: {
        userId: '1',
        itemId: '1',
      },
    });
    expect(res.errors).toBeFalsy();
    expect(res.data?._entities[0].savedItemById.openView).toEqual(expectedView);
  });
});
