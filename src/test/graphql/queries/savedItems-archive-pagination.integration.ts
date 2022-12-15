import { readClient } from '../../../database/client';
import gql from 'graphql-tag';
import { expect } from 'chai';
import { seeds } from '@pocket-tools/backend-benchmarking';

import { getServer } from '../testServerUtil';
import { ListPaginationService } from '../../../dataService/listPaginationService';

// Note -- additional pagination-related tests are included in savedItems* test files
describe('getSavedItems pagination', () => {
  const db = readClient();
  const server = getServer('1', db, null);

  const baseVariables = {
    id: '1',
  };

  const PAGINATE = gql`
    query getSavedItem(
      $id: ID!
      $filter: SavedItemsFilter
      $pagination: PaginationInput
      $sort: SavedItemsSort
    ) {
      _entities(representations: { id: $id, __typename: "User" }) {
        ... on User {
          savedItems(filter: $filter, sort: $sort, pagination: $pagination) {
            totalCount
            pageInfo {
              startCursor
              endCursor
              hasNextPage
              hasPreviousPage
            }
            edges {
              cursor
              node {
                id
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

  describe('cursor generation without nulls', () => {
    let rowsById;
    const seeder = seeds.mockList('1', {
      count: 20,
      batchSize: 21,
      archiveRate: 1.0,
      favoriteRate: 1.0,
    });
    const batch = seeder.next(); // This gets the whole batch

    beforeAll(async () => {
      await db('list').truncate();
      await Promise.all([db('list').insert(batch.value['list'])]);
      const actualRows = await db('list').where({ user_id: 1 }).select();
      rowsById = actualRows.reduce((acc, row) => {
        acc[row.item_id] = row;
        return acc;
      }, {});
    });
    test.each([
      {
        sortBy: 'CREATED_AT',
        sortField: 'time_added',
      },
      {
        sortBy: 'UPDATED_AT',
        sortField: 'time_updated',
      },
      {
        sortBy: 'FAVORITED_AT',
        sortField: 'time_favorited',
      },
      {
        sortBy: 'ARCHIVED_AT',
        sortField: 'time_read',
      },
    ])('by $sortBy works', async ({ sortBy, sortField }) => {
      const variables = {
        sort: { sortBy, sortOrder: 'DESC' },
        pagination: {
          first: 3,
        },
        ...baseVariables,
      };
      const res = await server.executeOperation({
        query: PAGINATE,
        variables,
      });
      const edges = res.data._entities[0].savedItems.edges;
      edges.forEach((edge) => {
        const [actualId, actualTimestamp] = ListPaginationService.decodeCursor(
          edge.cursor
        );
        expect(actualId).to.equal(edge.node.id);
        expect(parseInt(actualTimestamp)).to.equal(
          new Date(rowsById[actualId][sortField]).getTime() / 1000
        );
      });
    });
  });
  describe('cursor generation with nulls', () => {
    const seeder = seeds.mockList('1', {
      count: 20,
      batchSize: 21,
      archiveRate: 0.0,
      favoriteRate: 0.0,
    });
    const batch = seeder.next(); // This gets the whole batch

    beforeAll(async () => {
      await db('list').truncate();
      await Promise.all([db('list').insert(batch.value['list'])]);
    });
    test.each([
      {
        sortBy: 'FAVORITED_AT',
      },
      {
        sortBy: 'ARCHIVED_AT',
      },
    ])('by $sortBy works', async ({ sortBy }) => {
      const variables = {
        sort: { sortBy, sortOrder: 'DESC' },
        pagination: {
          first: 3,
        },
        ...baseVariables,
      };
      const res = await server.executeOperation({
        query: PAGINATE,
        variables,
      });
      const edges = res.data._entities[0].savedItems.edges;
      edges.forEach((edge) => {
        const [actualId, actualTimestamp] = ListPaginationService.decodeCursor(
          edge.cursor
        );
        expect(actualId).to.equal(edge.node.id);
        expect(actualTimestamp).to.be.null;
      });
    });
  });
});
