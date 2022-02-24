import { readClient, writeClient } from '../../../database/client';
import { ApolloServer, gql } from 'apollo-server-express';
import { buildFederatedSchema } from '@apollo/federation';
import { typeDefs } from '../../../server/typeDefs';
import { resolvers } from '../../../resolvers';
import chai, { expect } from 'chai';
import { ContextManager } from '../../../server/context';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import { ItemsEventEmitter } from '../../../businessEvents/itemsEventEmitter';
import sinon from 'sinon';
import { UsersMetaService } from '../../../dataService';
import chaiDateTime from 'chai-datetime';
import { BasicItemEventPayload, EventType } from '../../../businessEvents';

chai.use(deepEqualInAnyOrder);
chai.use(chaiDateTime);

describe('Mutation for Tag deletions: ', () => {
  const db = writeClient();
  const eventEmitter = new ItemsEventEmitter();
  const dbTagsQuery = db('item_tags').select('tag').pluck('tag');
  const listUpdatedQuery = db('list').select('time_updated');
  const listStateQuery = db('list').select();
  const tagStateQuery = db('item_tags').select();
  const metaStateQuery = db('users_meta').select();
  const server = new ApolloServer({
    schema: buildFederatedSchema({ typeDefs, resolvers }),
    context: () => {
      return new ContextManager({
        request: {
          headers: {
            userid: '1',
            apiid: '0',
          },
        },
        db: {
          readClient: readClient(),
          writeClient: writeClient(),
        },
        eventEmitter: eventEmitter,
      });
    },
  });

  const date = new Date('2020-10-03 10:20:30'); // Consistent date for seeding
  const date1 = new Date('2020-10-03 10:30:30'); // Consistent date for seeding

  afterAll(async () => {
    await readClient().destroy();
    await writeClient().destroy();
  });

  afterEach(() => {
    sinon.restore();
  });

  beforeEach(async () => {
    // Shared list data
    await db('list').truncate();
    const listData = [
      { item_id: 0, status: 0, favorite: 0 },
      { item_id: 1, status: 1, favorite: 0 },
    ].map((row) => {
      return {
        ...row,
        user_id: 1,
        resolved_id: row.item_id,
        given_url: `http://${row.item_id}`,
        title: `title ${row.item_id}`,
        time_added: date,
        time_updated: date1,
        time_read: date,
        time_favorited: date,
        api_id: 'apiid',
        api_id_updated: 'apiid',
      };
    });
    await db('list').insert(listData);
  });

  describe('deleteSavedItemTags: ', () => {
    const deleteSavedItemTagsMutation = gql`
      mutation deleteSavedItemTags($input: [DeleteSavedItemTagsInput!]!) {
        deleteSavedItemTags(input: $input) {
          savedItemId
          tagId
        }
      }
    `;

    beforeEach(async () => {
      // Shared data for describe case
      await db('item_tags').truncate();
      const tagData = [
        { item_id: 0, tag: 'nandor' },
        { item_id: 0, tag: 'nadja' },
        { item_id: 0, tag: 'colin' },
        { item_id: 0, tag: 'laszlo' },
        { item_id: 0, tag: 'guillermo' },
        { item_id: 1, tag: 'viago' },
        { item_id: 1, tag: 'deacon' },
        { item_id: 1, tag: 'vladislav' },
      ].map((row) => {
        return {
          ...row,
          user_id: 1,
          status: 1,
          time_added: date,
          time_updated: date,
          api_id: 'apiid',
          api_id_updated: 'updated_api_id',
        };
      });
      await db('item_tags').insert(tagData);
    });

    it('should delete a tag from a savedItem', async () => {
      const now = new Date();
      const colin = Buffer.from('colin').toString('base64');
      const variables = {
        input: [{ savedItemId: 0, tagIds: [colin] }],
      };
      const res = await server.executeOperation({
        query: deleteSavedItemTagsMutation,
        variables,
      });
      const dbTags = await dbTagsQuery.clone().where('item_id', 0);
      const listItem = await listUpdatedQuery
        .clone()
        .where('item_id', 0)
        .first();
      expect(res.errors).to.be.undefined;
      expect(res.data.deleteSavedItemTags).to.deep.equal([
        { savedItemId: '0', tagId: colin },
      ]);
      expect(dbTags).to.deep.equalInAnyOrder([
        'nandor',
        'nadja',
        'guillermo',
        'laszlo',
      ]);
      // Also check that it updates the list item(s)
      // Getting knex.fn.now to stub in the service is a struggle, so use closeToTime
      expect(listItem.time_updated).to.be.closeToTime(now, 5);
    });

    it(' deleteSavedItemTags should emit remove_tags event on success', async () => {
      const colin = Buffer.from('colin').toString('base64');
      const nadja = Buffer.from('nadja').toString('base64');
      const deacon = Buffer.from('deacon').toString('base64');
      const variables = {
        input: [
          { savedItemId: 0, tagIds: [colin, nadja] },
          { savedItemId: 1, tagIds: [deacon] },
        ],
      };

      //register event before mutation, otherwise event won't be captured
      const eventObjs = [];
      eventEmitter.on(
        EventType.REMOVE_TAGS,
        (eventData: BasicItemEventPayload) => {
          eventObjs.push(eventData);
        }
      );

      const res = await server.executeOperation({
        query: deleteSavedItemTagsMutation,
        variables,
      });
      expect(res.errors).to.be.undefined;
      expect(eventObjs[0].user.id).equals('1');
      expect(parseInt((await eventObjs[0].savedItem).id)).equals(0);
      expect(eventObjs[0].tagsUpdated).to.deep.equalInAnyOrder([
        'colin',
        'nadja',
      ]);
      expect(parseInt((await eventObjs[1].savedItem).id)).equals(1);
      expect(eventObjs[1].tagsUpdated).to.deep.equalInAnyOrder(['deacon']);
    });

    it('should delete multiple tags from a savedItem', async () => {
      const now = new Date();
      const vampires = ['nandor', 'colin', 'laszlo', 'nadja'].map((vampire) =>
        Buffer.from(vampire).toString('base64')
      );
      const expectedData = vampires.map((vampire) => {
        return { savedItemId: '0', tagId: vampire };
      });
      const variables = {
        input: [{ savedItemId: '0', tagIds: vampires }],
      };
      const res = await server.executeOperation({
        query: deleteSavedItemTagsMutation,
        variables,
      });
      const dbTags = await dbTagsQuery.clone().where('item_id', 0);
      const listItem = await listUpdatedQuery
        .clone()
        .where('item_id', 0)
        .first();
      expect(res.errors).to.be.undefined;
      expect(res.data.deleteSavedItemTags).to.deep.equal(expectedData);
      expect(dbTags.length).to.equal(1);
      expect(dbTags[0]).to.equal('guillermo');
      expect(listItem.time_updated).to.be.closeToTime(now, 5);
    });

    it('should delete tags from multiple savedItems', async () => {
      const now = new Date();
      const newVampires = ['nandor', 'colin', 'laszlo', 'nadja'].map(
        (vampire) => Buffer.from(vampire).toString('base64')
      );
      const oldVampires = ['deacon', 'viago', 'vladislav'].map((vampire) =>
        Buffer.from(vampire).toString('base64')
      );
      const expectedData = newVampires
        .map((vampire) => {
          return { savedItemId: '0', tagId: vampire };
        })
        .concat(
          oldVampires.map((vampire) => {
            return { savedItemId: '1', tagId: vampire };
          })
        );
      const variables = {
        input: [
          { savedItemId: '0', tagIds: newVampires },
          { savedItemId: '1', tagIds: oldVampires },
        ],
      };
      const res = await server.executeOperation({
        query: deleteSavedItemTagsMutation,
        variables,
      });
      const dbTags = await dbTagsQuery
        .clone()
        .where('item_id', 0)
        .orWhere('item_id', 1);
      const updates = await listUpdatedQuery
        .clone()
        .where('item_id', 0)
        .orWhere('item_id', 1)
        .pluck('time_updated');
      expect(res.errors).to.be.undefined;
      expect(res.data.deleteSavedItemTags).to.deep.equal(expectedData);
      updates.forEach((update) => {
        expect(update).to.be.closeToTime(now, 5);
      });
      expect(dbTags.length).to.equal(1);
      expect(dbTags[0]).to.equal('guillermo');
    });

    it('should roll back if encounter an error during transaction', async () => {
      // Get the current db state
      const listState = await listStateQuery;
      const tagState = await tagStateQuery;
      const metaState = await metaStateQuery;

      sinon
        .stub(UsersMetaService.prototype, 'logTagMutation')
        .rejects(Error('server error'));
      const variables = {
        input: [
          { savedItemId: 0, tagIds: [Buffer.from('colin').toString('base64')] },
        ],
      };
      const res = await server.executeOperation({
        query: deleteSavedItemTagsMutation,
        variables,
      });
      expect(res.errors.length).to.equal(1);
      expect(res.errors[0].message).contains(
        'deleteSavedItemTags: server error while untagging a savedItem '
      );
      // Check that all the lists are still in the pre-operation state
      expect(await listStateQuery).to.deep.equalInAnyOrder(listState);
      expect(await tagStateQuery).to.deep.equalInAnyOrder(tagState);
      expect(await metaStateQuery).to.deep.equalInAnyOrder(metaState);
    });
  });
  describe('deleteTag: ', () => {
    const deleteTagMutation = gql`
      mutation deleteTag($id: ID!) {
        deleteTag(id: $id)
      }
    `;
    const viago = Buffer.from('viago').toString('base64');
    const nick = Buffer.from('nick').toString('base64');
    const tagQueryStub = db('item_tags').count();
    const tagLogSpy = sinon.spy(UsersMetaService.prototype, 'logTagMutation');

    beforeEach(async () => {
      // Shared data for describe case
      await db('item_tags').truncate();
      const tagData = [
        { item_id: 1, tag: 'viago' },
        { item_id: 0, tag: 'viago' },
        { item_id: 1, tag: 'deacon' },
        { item_id: 1, tag: 'vladislav' },
        { item_id: 0, tag: 'vladislav' },
      ].map((row) => {
        return {
          ...row,
          user_id: 1,
          status: 1,
          time_added: date,
          time_updated: date,
          api_id: 'apiid',
          api_id_updated: 'updated_api_id',
        };
      });
      await db('item_tags').insert(tagData);
    });

    afterEach(() => {
      tagLogSpy.resetHistory();
    });
    it('should completely remove an existing tag from all associated items', async () => {
      const variables = { id: viago };
      const res = await server.executeOperation({
        query: deleteTagMutation,
        variables,
      });
      const viagoCount = await tagQueryStub.where('tag', 'viago').first();
      expect(res.errors).to.be.undefined;
      expect(tagLogSpy.callCount).to.equal(1);
      expect(res.data.deleteTag).to.equal(viago);
      expect(viagoCount['count(*)']).to.equal(0);
    });
    it('should do nothing if the tag does not exist, and not return an error', async () => {
      const listState = await listStateQuery;
      const tagState = await tagStateQuery;
      const metaState = await metaStateQuery;

      const variables = { id: nick };
      const res = await server.executeOperation({
        query: deleteTagMutation,
        variables,
      });
      expect(res.errors).to.be.undefined;
      expect(res.data.deleteTag).to.equal(nick);
      expect(tagLogSpy.callCount).to.equal(0);
      // Ensure no db changes occurred
      expect(await listStateQuery).to.deep.equalInAnyOrder(listState);
      expect(await tagStateQuery).to.deep.equalInAnyOrder(tagState);
      expect(await metaStateQuery).to.deep.equalInAnyOrder(metaState);
    });
  });
});
