import { Knex } from 'knex';
import { IContext } from '../../server/context';
import { knexPaginator as paginate } from '@pocket/apollo-cursor-pagination';
import { defaultPage, PaginationInput, Tag, TagEdge } from '../../types';
import { TagObjectMapper } from '../tagObjectMapper';
import { cleanAndValidateTag } from '../utils';

export class TagDataService {
  private readDb: Knex;
  private readonly userId: string;
  private tagGroupQuery: Knex.QueryBuilder;

  constructor(context: IContext) {
    this.readDb = context.db.readClient;
    this.userId = context.userId;
  }

  private getTagsByUserSubQuery(): any {
    return this.readDb('item_tags')
      .select(
        'user_id AS userId',
        'tag as name',
        'tag',
        this.readDb.raw(`TO_BASE64(tag) as id`),
        this.readDb.raw('GROUP_CONCAT(item_id) as savedItems'),
        this.readDb.raw('UNIX_TIMESTAMP(MIN(time_added)) as _createdAt'),
        this.readDb.raw('UNIX_TIMESTAMP(MAX(time_updated)) as _updatedAt'),
        this.readDb.raw('NULL as _deletedAt'),
        this.readDb.raw('NULL as _version')
        //TODO: add version and deletedAt feature to tag
        //tagId need to return primary key id, when tag entity table is implemented in db.
      )
      .where({ user_id: parseInt(this.userId) })
      .groupBy('tag');
  }

  private getItemsByTagsAndUser(): any {
    return this.readDb
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

    const getTagsForItemQuery = this.readDb('item_tags')
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

  public async getTagsByUser(
    userId: string,
    pagination?: PaginationInput
  ): Promise<any> {
    pagination = pagination ?? { first: defaultPage };
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
}
