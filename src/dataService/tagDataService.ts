import { Knex } from 'knex';
import { IContext } from '../server/context';
import { knexPaginator as paginate } from '@pocket-tools/apollo-cursor-pagination';
import {
  DeleteSavedItemTagsInput,
  Pagination,
  SavedItem,
  SavedItemTagAssociation,
  SavedItemTagUpdateInput,
  Tag,
  TagCreateInput,
  TagEdge,
  TagUpdateInput,
} from '../types';
import { TagObjectMapper } from './tagObjectMapper';
import {
  cleanAndValidateTag,
  decodeBase64ToPlainText,
  mysqlTimeString,
} from './utils';
import config from '../config';
import { UsersMetaService } from './usersMetaService';
import { SavedItemDataService } from './savedItemsService';

/***
 * class that handles the read and write from `readitla-temp.item_tags` table.
 * note: for mutations, please pass the writeClient, otherwise there will be replication lags.
 */
export class TagDataService {
  private db: Knex;
  private readonly userId: string;
  private readonly apiId: string;
  private tagGroupQuery: Knex.QueryBuilder;
  private readonly savedItemService: SavedItemDataService;
  private readonly usersMetaService: UsersMetaService;

  constructor(
    context: IContext,
    savedItemDataService: SavedItemDataService
    //note: for mutations, please pass the writeClient,
    //otherwise there will be replication lags.
  ) {
    this.db = context.dbClient;
    this.userId = context.userId;
    this.apiId = context.apiId;
    this.savedItemService = savedItemDataService;
    this.usersMetaService = new UsersMetaService(context);
  }

  private getTagsByUserSubQuery(): any {
    return this.db('item_tags')
      .select(
        'user_id AS userId',
        'tag as name',
        'tag',
        this.db.raw(`TO_BASE64(tag) as id`),
        this.db.raw('GROUP_CONCAT(item_id) as savedItems'),
        this.db.raw('UNIX_TIMESTAMP(MIN(time_added)) as _createdAt'),
        this.db.raw('UNIX_TIMESTAMP(MAX(time_updated)) as _updatedAt'),
        this.db.raw('NULL as _deletedAt'),
        this.db.raw('NULL as _version')
        //TODO: add version and deletedAt feature to tag
        //tagId need to return primary key id, when tag entity table is implemented in db.
      )
      .where({ user_id: parseInt(this.userId) })
      .groupBy('tag');
  }

  private getItemsByTagsAndUser(): any {
    return this.db
      .select('*')
      .from(this.getTagsByUserSubQuery().as('subQuery_tags'))
      .orderBy('tag');
    // need a stable sort for pagination; this is not client-configurable
    //note: time added and time updated are mostly null in the database.
    //so set them as optional field.
  }

  /**
   * For a given item_id, retrieves tags
   * and list of itemIds associated with it.
   * @param itemId
   */
  public async getTagsByUserItem(itemId: string): Promise<Tag[]> {
    const subQueryName = 'subQuery_tags';
    const getItemIdsForEveryTag = this.getTagsByUserSubQuery().as(subQueryName);

    const getTagsForItemQuery = this.db('item_tags')
      .select(`${subQueryName}.*`)
      .where({
        user_id: parseInt(this.userId),
        item_id: itemId,
      });

    const result = await getTagsForItemQuery.join(
      getItemIdsForEveryTag,
      function () {
        this.on('item_tags.tag', '=', `${subQueryName}.tag`);
      }
    );

    return result.map(TagObjectMapper.mapDbModelToDomainEntity);
  }

  /**
   * For a given item_id, retrieves suggested tags
   * ----TAKEN FROM THE WEB REPO.----
   * - Attempts to get 8 suggested tags for a user and itemid
   * - We only show you tags that you’ve already created — no new suggestions
   * -- This means that when you save an item, we get the Google entities and Google categories for that item, and
   * suggest tags you’ve used for other items you’ve also tagged with those entities and categories
   * - We’re dropping support for looking at how other users tag items
   * -— this means that if you save an item with specific Google entities and categories that you haven’t previously
   * tagged before, we can’t offer you tag suggestions
   * -- When we reinvest in this tech in the future, we’ll set this up to continue to look at how other people tag
   * items, but ONLY surface tags you’ve already used.
   *  - In the new version, we’ll no longer exclude entities / categories that were sensitive/adult subjects since
   *  we’re only showing you your own tags
   * - Those tags still need to have a relevance score of at least 0.005 to be eligible to appear as a Suggested Tag
   * @param itemId
   */
  public async getSuggestedTagsByUserItem(
    resolvedItemId: string
  ): Promise<Pick<Tag, 'name' | 'id'>[]> {
    const getTagsForItemQuery = await this.db.raw(
      `SELECT tag            AS tag,
      tag            AS name,
      MAX(score)     AS score,
      TO_BASE64(tag) AS id
      FROM (SELECT tag,
                  sum AS score
          FROM (SELECT m.tag,
                        SUM(m.count) * 100 AS sum
                FROM (SELECT it.tag,
                              ig.grouping_id,
                              COUNT(1) AS count
                      FROM (SELECT tag, item_id, user_id
                            FROM \`readitla_ril-tmp\`.item_tags
                            WHERE user_id = :userId
                            ORDER BY item_id DESC
                            LIMIT 1000) AS it
                                STRAIGHT_JOIN \`readitla_ril-tmp\`.list AS l
                            ON (it.item_id = l.item_id AND it.user_id = l.user_id)
                                STRAIGHT_JOIN \`readitla_b\`.item_grouping AS ig ON (l.resolved_id = ig.resolved_id)
                                STRAIGHT_JOIN \`readitla_b\`.grouping AS g
                            ON (ig.grouping_id = g.grouping_id AND g.grouping_type_id IN (2, 3, 19, 20))
                      GROUP BY it.tag, ig.grouping_id
                      ORDER BY count DESC
                      LIMIT 10000) AS m
                          JOIN \`readitla_b\`.item_grouping ig
                              ON (m.grouping_id = ig.grouping_id AND ig.resolved_id = :resolvedId)
                GROUP BY m.tag
                ORDER BY sum DESC
                LIMIT 5) related_tags

          UNION

          SELECT tag,
                  MAX(count) AS score
          FROM (SELECT tag,
                        COUNT(1) count
                FROM (SELECT tag, item_id
                      FROM \`readitla_ril-tmp\`.item_tags
                      WHERE user_id = :userId
                      ORDER BY item_id DESC
                      LIMIT 1000) AS r
                GROUP BY tag
                ORDER BY count DESC
                LIMIT 5) AS frecent_tags) AS tags
      GROUP BY tag
      ORDER BY score DESC
      LIMIT 8;`,
      { resolvedId: resolvedItemId, userId: this.userId }
    );
    // Returning a partial here because joining on `item_tags` to get additional
    // data is very expensive; lazily load those fields at the resolver level
    // only if they are requested.
    return getTagsForItemQuery[0].map((row) => ({
      id: row.id,
      name: row.name,
    }));
  }

  public async getTagsByName(names: string[]): Promise<any> {
    const cleanTags = names.map(cleanAndValidateTag);
    const tags = await this.getTagsByUserSubQuery().andWhere(function () {
      this.whereIn('tag', cleanTags);
    });
    return tags.map(TagObjectMapper.mapDbModelToDomainEntity);
  }

  public async getTagByName(tagName: string): Promise<Tag> {
    const result = await this.getTagsByUserSubQuery().where(
      'tag',
      cleanAndValidateTag(tagName)
    );
    return TagObjectMapper.mapDbModelToDomainEntity(result[0]);
  }

  public async getTagById(tagId: string): Promise<Tag> {
    const tagName = Buffer.from(tagId, 'base64').toString();
    return this.getTagByName(tagName);
  }

  public async getTagsById(tagIds: string[]): Promise<Tag[]> {
    const tagNames = tagIds.map((tagId) =>
      Buffer.from(tagId, 'base64').toString()
    );
    return this.getTagsByName(tagNames);
  }

  public async getTagsByUser(
    userId: string,
    pagination?: Pagination
  ): Promise<any> {
    pagination = pagination ?? { first: config.pagination.defaultPageSize };
    const query = this.getItemsByTagsAndUser();
    const result = await paginate(
      query,
      {
        first: pagination?.first,
        last: pagination?.last,
        before: pagination?.before,
        after: pagination?.after,
        orderBy: 'tag',
        orderDirection: 'ASC',
      },
      {
        primaryKey: 'tag',
        modifyEdgeFn: (edge): TagEdge => ({
          ...edge,
          node: {
            ...edge.node,
          },
        }),
      }
    );

    for (const edge of result.edges) {
      edge.node = TagObjectMapper.mapDbModelToDomainEntity(edge.node);
    }
    return result;
  }

  /**
   * Deduplicate a batch of tags prior to inserting in the
   * database. Compares values for all keys of the TagCreateInput type.
   * The keys aren't available until compile time, but if they get changed
   * the linter should remind the dev to update.
   * Best if this method is run after tags are 'cleaned'.
   */
  public static deduplicateTagInput(
    tagInputs: TagCreateInput[]
  ): TagCreateInput[] {
    const deduplicated = new Map();
    const tagKeys: Array<keyof TagCreateInput> = ['name', 'savedItemId'];
    tagInputs.forEach((tagInput: TagCreateInput) => {
      // Combine all values of all tag input props into a single lookup key
      const lookupKey = tagKeys.reduce(
        (accumulator: string, currentKey) =>
          accumulator + `|${tagInput[currentKey]}`,
        ''
      );
      deduplicated.set(lookupKey, tagInput);
    });
    return Array.from(deduplicated.values());
  }

  /**
   * Insert tags into the database for items in a user's list
   * Note: does not check to ensure that the item being tagged
   * is actually in the user's list (no foreign key constraint).
   * @param tagInputs
   */
  public async insertTags(tagInputs: TagCreateInput[]): Promise<void> {
    await this.db.transaction(async (trx: Knex.Transaction) => {
      await this.insertTagAndUpdateSavedItem(tagInputs, trx);
      await this.usersMetaService.logTagMutation(new Date(), trx);
    });
  }

  private async insertTagAndUpdateSavedItem(
    tagInputs: TagCreateInput[],
    trx: Knex.Transaction<any, any[]>
  ) {
    const cleanedTagInput = tagInputs.map((tagInput) => {
      return {
        name: cleanAndValidateTag(tagInput.name),
        savedItemId: tagInput.savedItemId,
      };
    });
    // Deduplicate after cleaning, since cleaning could cause duplication
    const tagSet = TagDataService.deduplicateTagInput(cleanedTagInput);

    const timestamp = mysqlTimeString(new Date(), config.database.tz);

    const inputData = tagSet.map((tagInput) => {
      return {
        user_id: parseInt(this.userId),
        item_id: parseInt(tagInput.savedItemId),
        tag: tagInput.name,
        time_added: timestamp,
        time_updated: timestamp,
        api_id: parseInt(this.apiId),
      };
    });
    await trx('item_tags').insert(inputData).onConflict().ignore();
    const itemIds = tagSet.map((element) => element.savedItemId);
    await this.savedItemService.updateListItemMany(itemIds).transacting(trx);
  }

  /**
   * Delete associations between tags and saved items.
   * All updates are performed in the same transaction.
   * @param input Specify the association pairs to remove
   */
  public async deleteSavedItemAssociations(
    input: DeleteSavedItemTagsInput[]
  ): Promise<SavedItemTagAssociation[]> {
    // Explode itemIds list keyed on savedItem into savedItem:itemId
    const associations: SavedItemTagAssociation[] = input.flatMap(
      (savedItemGroup) =>
        savedItemGroup.tagIds.map((tagId) => ({
          savedItemId: savedItemGroup.savedItemId,
          tagId: tagId,
        }))
    );
    await this.db.transaction(async (trx: Knex.Transaction) => {
      const tagDeleteSubquery = trx('item_tags')
        .andWhere('user_id', this.userId)
        .delete();
      // Build array of promises to delete association row
      const deletePromises = associations.map((association) => {
        const tagName = Buffer.from(association.tagId, 'base64').toString();
        return tagDeleteSubquery
          .clone()
          .where({ item_id: association.savedItemId, tag: tagName });
      });
      await Promise.all(deletePromises);

      // Need to mark an update on the list items
      const itemIds = input.map((element) => element.savedItemId);
      await this.savedItemService.updateListItemMany(itemIds).transacting(trx);
      // Also need to update the users_meta
      await this.usersMetaService.logTagMutation(new Date(), trx);
    });
    return associations;
  }

  /**
   * Completely remove a tag from the database for a user, and delete all
   * associations it has to a user's SavedItems
   * @param id The ID of the tag to delete
   */
  public async deleteTagObject(id: string): Promise<void> {
    const tagName = decodeBase64ToPlainText(id);
    const affectedItems = await this.db('item_tags')
      .where({ user_id: this.userId, tag: tagName })
      .pluck('item_id');
    if (affectedItems.length > 0) {
      await this.db.transaction(async (trx: Knex.Transaction) => {
        await this.deleteTagsByName(tagName).transacting(trx);
        await this.savedItemService
          .updateListItemMany(affectedItems)
          .transacting(trx);
        await this.usersMetaService.logTagMutation(new Date(), trx);
      });
    }
  }

  /**
   * updates the tag name for the given user
   * @param tagUpdateInput tagUpdate input provided in the request
   * @param itemIds
   */
  public async updateTagByUser(
    tagUpdateInput: TagUpdateInput,
    itemIds: string[]
  ): Promise<void> {
    const oldTagName = decodeBase64ToPlainText(tagUpdateInput.id);
    const newTagName = cleanAndValidateTag(tagUpdateInput.name);
    await this.db.transaction(async (trx: Knex.Transaction) => {
      await trx.raw(
        `update ignore item_tags
         set tag=:newTagName,
             time_updated=:_updatedAt where user_id = :userId and tag=:oldTagName`,
        {
          newTagName: newTagName,
          userId: this.userId,
          oldTagName: oldTagName,
          _updatedAt: mysqlTimeString(new Date(), config.database.tz),
        }
      );
      await this.savedItemService.updateListItemMany(itemIds).transacting(trx);
      await this.deleteTagsByName(oldTagName).transacting(trx);
      await this.usersMetaService.logTagMutation(new Date(), trx);
    });
  }

  /**
   * Replaces existing tags association with the input tagIds for a given savedItemId
   * Note: As there is no foreign key constraint of itemId in item_tags table, we don't
   * explicitly check if savedItemId exist before replacing the tags. So right now, we can
   * create tags for a non-existent savedItem.
   * @param savedItemTagUpdateInput gets savedItemId and the input tagIds
   * @return savedItem savedItem whose tag got updated
   * todo: make a check if savedItemId exist before deleting.
   */
  public async updateSavedItemTags(
    savedItemTagUpdateInput: SavedItemTagUpdateInput
  ): Promise<SavedItem> {
    await this.db.transaction(async (trx: Knex.Transaction) => {
      await this.deleteTagsByItemId(
        savedItemTagUpdateInput.savedItemId
      ).transacting(trx);

      const tagCreateInput: TagCreateInput[] =
        savedItemTagUpdateInput.tagIds.map((tagId) => {
          return {
            name: decodeBase64ToPlainText(tagId),
            savedItemId: savedItemTagUpdateInput.savedItemId,
          };
        });

      await this.insertTagAndUpdateSavedItem(tagCreateInput, trx);
      await this.usersMetaService.logTagMutation(new Date(), trx);
    });

    return await this.savedItemService.getSavedItemById(
      savedItemTagUpdateInput.savedItemId
    );
  }

  /**
   * deletes all the tags associated with the given savedItem id.
   * if the tag is associated only with the give itemId, then the tag
   * will be deleted too.
   * @param savedItemId
   * @returns savedItem savedItem whose tag got removed.
   */
  public async updateSavedItemRemoveTags(savedItemId: string): Promise<any> {
    //clear first, so we can get rid of noisy data if savedItem doesn't exist.
    await this.db.transaction(async (trx: Knex.Transaction) => {
      await this.deleteTagsByItemId(savedItemId).transacting(trx);
      await this.savedItemService
        .updateListItemOne(savedItemId)
        .transacting(trx);
      await this.usersMetaService.logTagMutation(new Date(), trx);
    });

    return await this.savedItemService.getSavedItemById(savedItemId);
  }

  /**
   * Replaces all tags associated with a given savedItem id
   * @param tagsInputs : list of tagCreateInput
   */
  public async replaceSavedItemTags(
    tagInputs: TagCreateInput[]
  ): Promise<SavedItem[]> {
    const savedItemIds = tagInputs.map((input) => input.savedItemId);

    await this.db.transaction(async (trx) => {
      await Promise.all(
        savedItemIds.map(async (id) => {
          await this.deleteTagsByItemId(id).transacting(trx);
        })
      );
      await this.insertTagAndUpdateSavedItem(tagInputs, trx);
      await this.usersMetaService.logTagMutation(new Date(), trx);
    });

    return await this.savedItemService.batchGetSavedItemsByGivenIds(
      savedItemIds
    );
  }

  private deleteTagsByItemId(itemId: string): Knex.QueryBuilder {
    return this.db('item_tags')
      .where({ user_id: this.userId, item_id: itemId })
      .del();
  }

  private deleteTagsByName(tagName: string): Knex.QueryBuilder {
    return this.db('item_tags')
      .where({ user_id: this.userId, tag: tagName })
      .del();
  }
}
