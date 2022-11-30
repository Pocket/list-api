import { expect } from 'chai';
import { ContextManager, IContext } from './context';
import { Knex } from 'knex';
import DataLoader from 'dataloader';
import { SavedItemDataService } from '../dataService';
import { SavedItem } from '../types';
import { EventType, ItemsEventEmitter } from '../businessEvents';
import * as Sentry from '@sentry/node';
import sinon from 'sinon';

jest.mock('../dataService');

describe('context', () => {
  const savedItem: SavedItem = {
    id: '1',
    resolvedId: '1',
    url: 'dont-care.com',
    isFavorite: false,
    status: 'UNREAD',
    isArchived: false,
    item: {
      givenUrl: 'dont-care.com',
    },
  };
  describe('event emitter', () => {
    let sentryEventSpy;
    let sentryExceptionSpy;
    const context = new ContextManager({
      request: {
        headers: { userid: '1', apiid: '0' },
      },
      dbClient: jest.fn() as unknown as Knex,
      eventEmitter: new ItemsEventEmitter(),
    });
    beforeEach(() => {
      sinon.restore();
      sentryEventSpy = sinon.spy(Sentry, 'captureEvent');
      sentryExceptionSpy = sinon.spy(Sentry, 'captureException');
    });
    afterAll(() => sinon.restore());
    it('should log a warning to Sentry if save is undefined', async () => {
      await context.emitItemEvent(EventType.ARCHIVE_ITEM, undefined);
      expect(sentryEventSpy.callCount).to.equal(1);
      const event = sentryEventSpy.getCall(0).args[0];
      expect(event.message).to.contain('Save was null or undefined');
      expect(event.level).to.equal('warning');
    });
    it('should log a warning to Sentry if save is null', async () => {
      await context.emitItemEvent(EventType.ARCHIVE_ITEM, null);
      expect(sentryEventSpy.callCount).to.equal(1);
      const event = sentryEventSpy.getCall(0).args[0];
      expect(event.message).to.contain('Save was null or undefined');
      expect(event.level).to.equal('warning');
    });
    it('should emit event if data is valid', async () => {
      const emitStub = sinon
        .stub(context.eventEmitter, 'emitItemEvent')
        .resolves();
      sinon.stub(context.models.tag, 'getBySaveId').resolves([]);
      await context.emitItemEvent(EventType.ARCHIVE_ITEM, savedItem);
      expect(emitStub.callCount).to.equal(1);
    });
    it('should emit event to listener', async () => {
      const listenerFn = sinon.fake();
      // listener
      context.eventEmitter.on(EventType.ARCHIVE_ITEM, listenerFn);
      sinon.stub(context.models.tag, 'getBySaveId').resolves([]);
      await context.emitItemEvent(EventType.ARCHIVE_ITEM, savedItem);
      expect(listenerFn.callCount).to.equal(1);
    });
    it('should send exception with warning level to Sentry if payload generation fails', async () => {
      sinon
        .stub(context.models.tag, 'getBySaveId')
        .rejects(new Error('my error'));
      await context.emitItemEvent(EventType.ARCHIVE_ITEM, savedItem);
      expect(sentryExceptionSpy.callCount).to.equal(1);
      const event = sentryExceptionSpy.getCall(0).args;
      expect(event[0].message).to.contain('my error');
      expect(event[1].level).to.equal('warning');
    });
  });
  describe('dataloaders', () => {
    let batchUrlFnSpy;
    let batchIdFnSpy;
    let context: IContext;

    beforeEach(() => {
      batchUrlFnSpy =
        SavedItemDataService.prototype.batchGetSavedItemsByGivenUrls = jest
          .fn()
          .mockResolvedValue([savedItem]);
      batchIdFnSpy =
        SavedItemDataService.prototype.batchGetSavedItemsByGivenIds = jest
          .fn()
          .mockResolvedValue([savedItem]);
      context = new ContextManager({
        request: {
          headers: { userid: '1', apiid: '0' },
        },
        dbClient: jest.fn() as unknown as Knex,
        eventEmitter: null,
      });
    });

    afterEach(() => jest.clearAllMocks());

    it('creates a data loader for saved items on initialization', async () => {
      const savedItems = await context.dataLoaders.savedItemsByUrl.load(
        'dont-care.com'
      );

      expect(context.dataLoaders.savedItemsByUrl).to.be.instanceof(DataLoader);
      expect(context.dataLoaders.savedItemsByUrl).to.be.instanceof(DataLoader);
      expect(batchUrlFnSpy.mock.calls[0][0]).to.deep.equal(['dont-care.com']);
      expect(savedItems).to.deep.equal(savedItem);
    });
    it('Uses the same dataloader for every load request', async () => {
      // Referencing the loader 2x should return the same object
      const loader = context.dataLoaders.savedItemsByUrl;
      const loaderAgain = context.dataLoaders.savedItemsByUrl;
      await loader.load('dont-care.com');
      // At this point both loaders should have filled cache since referencing same object
      expect(Array.from((loader as any)._cacheMap.keys())).to.contain(
        'dont-care.com'
      );
      expect(Array.from((loaderAgain as any)._cacheMap.keys())).to.contain(
        'dont-care.com'
      );
      await loaderAgain.load('dont-care.com');
      // Second load should have used the cache, so only one call to batch fn
      expect(batchUrlFnSpy.mock.calls.length).to.equal(1);
    });
    it('savedItemById dataloader should fill cache of savedItemByUrl dataloader', async () => {
      await context.dataLoaders.savedItemsById.load('1');
      const loadedItem = await context.dataLoaders.savedItemsByUrl.load(
        'dont-care.com'
      );
      expect(
        Array.from((context.dataLoaders.savedItemsById as any)._cacheMap.keys())
      ).to.contain('1');
      expect(batchIdFnSpy.mock.calls.length).to.equal(1);
      expect(batchUrlFnSpy.mock.calls.length).to.equal(0);
      expect(loadedItem).to.deep.equal(savedItem);
    });
    it('savedItemByUrl dataloader should fill cache of savedItemById dataloader', async () => {
      await context.dataLoaders.savedItemsByUrl.load('dont-care.com');
      const loadedItem = await context.dataLoaders.savedItemsById.load('1');
      expect(
        Array.from((context.dataLoaders.savedItemsById as any)._cacheMap.keys())
      ).to.contain('1');
      expect(batchUrlFnSpy.mock.calls.length).to.equal(1);
      expect(batchIdFnSpy.mock.calls.length).to.equal(0);
      expect(loadedItem).to.deep.equal(savedItem);
    });
  });
});
