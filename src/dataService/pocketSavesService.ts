import { Knex } from 'knex';
import { IContext } from '../server/context';
import {
  mysqlDateConvert,
  mysqlTimeString,
  setDifference,
  uniqueArray,
} from './utils';
import { PocketSaveStatus } from '../types';
import { NotFoundError } from '@pocket-tools/apollo-utils';
import config from '../config';

export type RawListResult = {
  api_id: string;
  api_id_updated: number;
  favorite: number;
  given_url: string;
  item_id: number;
  resolved_id: number;
  status: number;
  time_added: Date;
  time_favorited: Date;
  time_read: Date;
  time_updated: Date;
  title: string;
  user_id: number;
};

export type ListResult = {
  api_id: string;
  api_id_updated: number;
  favorite: number;
  given_url: string;
  item_id: number;
  resolved_id: number;
  status: keyof typeof PocketSaveStatus;
  time_added: Date;
  time_favorited: Date;
  time_read: Date;
  time_updated: Date;
  title: string;
  user_id: number;
};

export type ListArchiveUpdate = {
  status: PocketSaveStatus.ARCHIVED;
  time_read: Date;
};

/**
 * Make PocketSaveStatus enums
 * to the desired status string.
 */
const statusMap = {
  [PocketSaveStatus.UNREAD]: 'UNREAD',
  [PocketSaveStatus.ARCHIVED]: 'ARCHIVED',
  [PocketSaveStatus.DELETED]: 'DELETED',
  [PocketSaveStatus.HIDDEN]: 'HIDDEN',
};

/**
 * Convert the given raw MySQL list row into the desired list row types.
 * Converts status ints into desired PocketSaveStatus enum strings.
 * Converts MySQL date responses into validated Typescript Date objects,
 * filtering out (returning null) values like '0000-00-00 00:00:00'.
 * @param row
 */
const convert = (row: RawListResult) => {
  const result: ListResult = {
    api_id: row.api_id,
    api_id_updated: row.api_id_updated,
    favorite: row.favorite,
    given_url: row.given_url,
    item_id: row.item_id,
    resolved_id: row.resolved_id,
    status: statusMap[row.status],
    time_added: mysqlDateConvert(row.time_added),
    time_favorited: mysqlDateConvert(row.time_favorited),
    time_read: mysqlDateConvert(row.time_read),
    time_updated: mysqlDateConvert(row.time_updated),
    title: row.title,
    user_id: row.user_id,
  };
  return result;
};

/***
 * class that handles the read and write from `readitla-temp.list` table
 * note: for mutations, please pass the writeClient, otherwise there will be replication lags.
 */
export class PocketSaveDataService {
  private db: Knex;
  private readonly apiId: string;
  private readonly userId: string;
  private readonly selectCols: Array<keyof RawListResult> = [
    'api_id',
    'api_id_updated',
    'favorite',
    'given_url',
    'item_id',
    'resolved_id',
    'status',
    'time_added',
    'time_favorited',
    'time_read',
    'time_updated',
    'title',
    'user_id',
  ];

  constructor(context: Pick<IContext, 'apiId' | 'dbClient' | 'userId'>) {
    this.apiId = context.apiId;
    this.db = context.dbClient;
    this.userId = context.userId;
  }

  public static convertListResult(listResult: null): null;
  public static convertListResult(listResult: RawListResult): ListResult;
  public static convertListResult(listResult: RawListResult[]): ListResult[];
  /**
   * Convert the `status` field in the list table to the expected
   * GraphQL ENUM string
   * @param listResult
   */
  public static convertListResult(
    listResult: RawListResult | RawListResult[] | null
  ): ListResult | ListResult[] | null {
    if (listResult === undefined || listResult === null) {
      return null;
    }

    if (listResult instanceof Array) {
      return listResult.map((row) => convert(row));
    }
    return convert(listResult);
  }

  /**
   * Helper function to build repeated queries, for DRY pocketSave and pocketSaves fetches.
   * Will eventually be extended for building filter, sorts, etc. for different pagination, etc.
   * For now just to reuse the same query and reduce testing burden :)
   */
  public buildQuery(): Knex.QueryBuilder<RawListResult, RawListResult[]> {
    return this.db('list').select(this.selectCols);
  }

  /**
   * Fetch a List Table Row By ID (user id x item_id)
   * @param itemId the pocketSave ID to fetch
   */
  public async getListRowById(itemId: string): Promise<ListResult> {
    const query = await this.buildQuery()
      .where('user_id', this.userId)
      .andWhere('item_id', itemId)
      .first();
    return PocketSaveDataService.convertListResult(query);
  }

  public async getListRowByIds(itemIds: string[]): Promise<ListResult[]> {
    const query = await this.buildQuery()
      .whereIn('item_id', itemIds)
      .where('user_id', this.userId);
    return PocketSaveDataService.convertListResult(query);
  }

  //todo: should we be passing the Dto here  - e.g SaveArchiveInputDto and transform happens in save.toDto(saveArchiveInput)
  public async archiveListRow(
    ids: string[],
    timestamp: Date
  ): Promise<{ updated: ListResult[]; missing: string[] }> {
    const timeUpdate = mysqlTimeString(timestamp, config.database.tz);
    const uniqueIds = uniqueArray(ids.map(parseInt));
    const updateSet = {
      status: PocketSaveStatus.ARCHIVED,
      // Don't reset timestamp if already archived -- essentially a no-op
      time_read: this.db.raw(
        `IF(status != ${PocketSaveStatus.ARCHIVED}, "${timeUpdate}", time_read)`
      ),
    };
    // Initialize response variables for use in outer scope
    let updated: RawListResult[];
    let missing: string[];
    try {
      await this.db.transaction(async (trx) => {
        const count = await trx('list')
          .update(updateSet)
          .whereIn('item_id', uniqueIds)
          .andWhere('user_id', this.userId);

        updated = await trx<RawListResult>('list')
          .select(this.selectCols)
          .whereIn('item_id', uniqueIds)
          .andWhere('user_id', this.userId);

        // Batches should be atomic -- roll back transaction if
        // there is an update that can't succeed due to value not
        // being present
        if (count !== uniqueIds.length) {
          throw new NotFoundError('At least one ID was not found');
        }
      });
    } catch (error) {
      // Capture NotFoundError and add to response
      if (error instanceof NotFoundError) {
        const extantIds = new Set(updated.map((row) => row.item_id));
        missing = setDifference(new Set(uniqueIds), extantIds).map((id) =>
          id.toString()
        );
        updated = [];
      } else {
        // Re-throw for resolver layer -- this is an internal server failure
        throw error;
      }
    }
    return {
      updated: PocketSaveDataService.convertListResult(updated),
      missing,
    };
  }
}
