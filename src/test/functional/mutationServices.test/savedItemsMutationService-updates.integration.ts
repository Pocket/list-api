import { writeClient } from '../../../database/client';
import { gql } from 'apollo-server-express';
import chai, { expect } from 'chai';
import chaiDateTime from 'chai-datetime';
import sinon from 'sinon';
import { EventType } from '../../../businessEvents';
import { ItemsEventEmitter } from '../../../businessEvents';
import { getUnixTimestamp } from '../../../utils';
import { getServer } from '../testServerUtil';

chai.use(chaiDateTime);

describe('Update Mutation for SavedItem: ', () => {
  //using write client as mutation will use write client to read as well.
  const db = writeClient();
  const eventEmitter = new ItemsEventEmitter();
  const server = getServer('1', db, eventEmitter);
  const date = new Date('2020-10-03 10:20:30'); // Consistent date for seeding
  const date1 = new Date('2020-10-03 10:30:30'); // Consistent date for seeding
  const updateDate = new Date(2021, 1, 1, 0, 0); // mock date for insert
  let clock;

  afterAll(async () => {
    await db.destroy();
    clock.restore();
  });

  beforeAll(async () => {
    // Mock Date.now() to get a consistent date for inserting data
    clock = sinon.useFakeTimers({
      now: updateDate,
      shouldAdvanceTime: true,
    });

    await db('list').truncate();
    const inputData = [
      { item_id: 0, status: 0, favorite: 0 },
      { item_id: 1, status: 1, favorite: 0 },
      { item_id: 2, status: 0, favorite: 1 },
      { item_id: 3, status: 0, favorite: 0 },
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
    await db('list').insert(inputData);
  });
  describe('updatedSavedItemArchive', () => {
    const variables = {
      itemId: '0',
    };

    const archiveItemMutation = gql`
      mutation updateSavedItemArchive($itemId: ID!) {
        updateSavedItemArchive(id: $itemId) {
          archivedAt
          isArchived
          status
          _updatedAt
        }
      }
    `;
    let res;
    const eventTracker = sinon.fake();
    eventEmitter.on(EventType.ARCHIVE_ITEM, eventTracker);

    beforeAll(async () => {
      res = await server.executeOperation({
        query: archiveItemMutation,
        variables,
      });
    });

    it('should archive an item', async () => {
      expect(res.errors).to.be.undefined;
      const itemRes = res.data?.updateSavedItemArchive;
      expect(itemRes.status).to.equal('ARCHIVED');
      expect(itemRes.isArchived).to.equal(true);
      expect(itemRes._updatedAt)
        .to.equal(itemRes.archivedAt)
        .and.to.equal(getUnixTimestamp(updateDate));
    });
    it('should emit an archive event', async () => {
      // This test is guaranteed to run after the query is completed, so
      // can act as though event is synchronous
      expect(eventTracker.calledOnce).to.be.true;
      expect((await eventTracker.getCall(0).args[0].savedItem).id).to.equal(
        parseInt(variables.itemId)
      );
    });
  });
  describe('updatedSavedItemUnArchive', () => {
    const variables = {
      itemId: '1',
    };

    const unArchiveItemMutation = gql`
      mutation updateSavedItemUnArchive($itemId: ID!) {
        updateSavedItemUnArchive(id: $itemId) {
          archivedAt
          isArchived
          status
          _updatedAt
        }
      }
    `;
    let res;
    const eventTracker = sinon.fake();
    eventEmitter.on(EventType.UNARCHIVE_ITEM, eventTracker);

    beforeAll(async () => {
      res = await server.executeOperation({
        query: unArchiveItemMutation,
        variables,
      });
    });

    it('should unarchive an item', async () => {
      expect(res.errors).to.be.undefined;
      const itemRes = res.data?.updateSavedItemUnArchive;
      expect(itemRes.status).to.equal('UNREAD');
      expect(itemRes.isArchived).to.equal(false);
      expect(itemRes._updatedAt).to.equal(getUnixTimestamp(updateDate));
      expect(itemRes.archivedAt).to.be.null;
    });
    it('should emit an unarchive event', async () => {
      // This test is guaranteed to run after the query is completed, so
      // can act as though event is synchronous
      expect(eventTracker.calledOnce).to.be.true;
      expect((await eventTracker.getCall(0).args[0].savedItem).id).to.equal(
        parseInt(variables.itemId)
      );
    });
  });
  describe('updatedSavedItemFavorite', () => {
    let res;
    const variables = {
      itemId: '3',
    };

    const savedItemFavoriteMutation = gql`
      mutation updateSavedItemFavorite($itemId: ID!) {
        updateSavedItemFavorite(id: $itemId) {
          favoritedAt
          isFavorite
          _updatedAt
        }
      }
    `;

    const eventTracker = sinon.fake();
    eventEmitter.on(EventType.FAVORITE_ITEM, eventTracker);

    beforeAll(async () => {
      res = await server.executeOperation({
        query: savedItemFavoriteMutation,
        variables,
      });
    });

    it('should favorite an item', async () => {
      expect(res.errors).to.be.undefined;
      const itemRes = res.data?.updateSavedItemFavorite;
      expect(itemRes.isFavorite).to.equal(true);
      expect(itemRes._updatedAt)
        .to.equal(itemRes.favoritedAt)
        .and.to.equal(getUnixTimestamp(updateDate));
    });
    it('should emit a favorite event', async () => {
      // This test is guaranteed to run after the query is completed, so
      // can act as though event is synchronous
      expect(eventTracker.calledOnce).to.be.true;
      expect((await eventTracker.getCall(0).args[0].savedItem).id).to.equal(
        parseInt(variables.itemId)
      );
    });
  });
  describe('updatedSavedItemUnFavorite', () => {
    let res;
    const variables = {
      itemId: '2',
    };

    const savedItemUnFavoriteMutation = gql`
      mutation updateSavedItemUnFavorite($itemId: ID!) {
        updateSavedItemUnFavorite(id: $itemId) {
          favoritedAt
          isFavorite
          _updatedAt
        }
      }
    `;
    const eventTracker = sinon.fake();
    eventEmitter.on(EventType.UNFAVORITE_ITEM, eventTracker);

    beforeAll(async () => {
      res = await server.executeOperation({
        query: savedItemUnFavoriteMutation,
        variables,
      });
    });
    it('should unfavorite an item', async () => {
      expect(res.errors).to.be.undefined;
      const itemRes = res.data?.updateSavedItemUnFavorite;
      expect(itemRes.isFavorite).to.equal(false);
      expect(itemRes._updatedAt).to.equal(getUnixTimestamp(updateDate));
      expect(itemRes.favoritedAt).to.be.null;
    });

    it('should emit an unfavorite event', async () => {
      // This test is guaranteed to run after the query is completed, so
      // can act as though event is synchronous
      expect(eventTracker.calledOnce).to.be.true;
      expect((await eventTracker.getCall(0).args[0].savedItem).id).to.equal(
        parseInt(variables.itemId)
      );
    });
  });
});
