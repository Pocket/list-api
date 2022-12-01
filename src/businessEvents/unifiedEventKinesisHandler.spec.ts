import config from '../config';
import {
  EventType,
  ItemEventPayload,
  unifiedEventKinesisHandler,
  unifiedEventTransformer,
} from '.';
import kinesis from '../aws/kinesis';
import { SavedItem } from '../types';
import { getUnixTimestamp } from '../utils';

describe('UnifiedEventHandler', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const testSavedItem: SavedItem = {
    id: '2',
    resolvedId: '1',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    isFavorite: true,
    isArchived: false,
    status: 'UNREAD',
    item: {
      givenUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    },
  };

  it('should log an error if there are failed messages after retrying', async () => {
    const eventStub = {
      source: config.events.source,
      version: config.events.version,
      user: { id: '1', isPremium: false },
      apiUser: { apiId: '1' },
      eventType: EventType.ADD_ITEM,
      data: { abc: '123' },
      savedItem: testSavedItem,
    } as Omit<ItemEventPayload, 'timestamp'>;

    // Since you can't spy on recursive call, the wait function stands
    // in as it's invoked before recursive call for every retry
    const consoleSpy = jest.spyOn(console, 'log');
    // Don't lint unused function
    // eslint-disable-next-line
    const mockSend = jest.spyOn(kinesis, 'send').mockImplementation(() => {
      return {
        FailedRecordCount: 1,
        Records: [{ ErrorCode: null }, { ErrorCode: 500 }, { ErrorCode: null }],
      };
    });
    await unifiedEventKinesisHandler([
      { ...eventStub, timestamp: 0 },
      { ...eventStub, timestamp: 1 },
      { ...eventStub, timestamp: 2 },
    ]);
    expect(consoleSpy.mock.calls.length).toEqual(1);
    expect(consoleSpy.mock.calls[0][0]).toContain(
      'ERROR: Failed to send 1 event(s) to kinesis stream'
    );
    const expectedFailedEvent = {
      type: 'user-list-item-created',
      data: {
        user_id: parseInt(eventStub.user.id),
        item_id: parseInt(testSavedItem.id),
        api_id: parseInt(eventStub.apiUser.apiId),
      },
      timestamp: 1,
      source: config.events.source,
      version: config.events.version,
    };
    expect(consoleSpy.mock.calls[0][0]).toContain(
      JSON.stringify(expectedFailedEvent)
    );
  });

  it('should include tagUpdated in kinesis payload for tagEvents', async () => {
    const eventStub = {
      source: config.events.source,
      version: config.events.version,
      user: { id: '1', isPremium: false },
      tagsUpdated: ['tagA', 'tagB'],
      apiUser: { apiId: '1' },
      eventType: EventType.ADD_TAGS,
      data: { abc: '123' },
      savedItem: testSavedItem,
      timestamp: Date.now(),
    };

    const expected = {
      type: 'user-item-tags-added',
      data: {
        user_id: parseInt(eventStub.user.id),
        item_id: parseInt(testSavedItem.id),
        api_id: parseInt(eventStub.apiUser.apiId),
        tags: eventStub.tagsUpdated,
      },
      timestamp: eventStub.timestamp,
      source: eventStub.source,
      version: eventStub.version,
    };

    const data = await unifiedEventTransformer(eventStub);
    expect(data).toEqual(expected);
  });

  it('should not include tagUpdated in kinesis payload for non-tag events', async () => {
    const eventStub = {
      source: config.events.source,
      version: config.events.version,
      user: { id: '1', isPremium: false },
      apiUser: { apiId: '1' },
      eventType: EventType.ADD_ITEM,
      tagsUpdated: ['tagA', 'tagB'],
      data: { abc: '123' },
      savedItem: testSavedItem,
      timestamp: getUnixTimestamp(),
    };

    const expected = {
      type: 'user-list-item-created',
      data: {
        user_id: parseInt(eventStub.user.id),
        item_id: parseInt(testSavedItem.id),
        api_id: parseInt(eventStub.apiUser.apiId),
      },
      timestamp: eventStub.timestamp,
      source: eventStub.source,
      version: eventStub.version,
    };

    const data = await unifiedEventTransformer(eventStub);
    expect(data).toEqual(expected);
  });
});
