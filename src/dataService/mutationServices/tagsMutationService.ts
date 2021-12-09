import { Knex } from 'knex';
import { IContext } from '../../server/context';
import {
  DeleteSavedItemTagsInput,
  SavedItemTagAssociation,
  TagCreateInput,
  TagUpdateInput,
  SavedItemTagUpdateInput,
} from '../../types';
import {
  cleanAndValidateTag,
  decodeBase64ToPlainText,
  mysqlTimeString,
} from '../utils';
import { SavedItemMutationService } from './savedItemsMutationService';
import { UsersMetaService } from './usersMetaService';
import config from '../../config';

export class TagMutationService {
  private writeDb: Knex;
  private readonly userId: string;
  private readonly apiId: string;
  private readonly savedItemService: SavedItemMutationService;
  private readonly usersMetaService: UsersMetaService;

  constructor(context: IContext) {
    this.writeDb = context.db.writeClient;
    this.userId = context.userId;
    this.apiId = context.apiId;
    this.savedItemService = new SavedItemMutationService(context);
    this.usersMetaService = new UsersMetaService(context);
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
   */
  public async insertTags(tagInputs: TagCreateInput[]): Promise<void> {
    await this.writeDb.transaction(async (trx: Knex.Transaction) => {
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
    const tagSet = TagMutationService.deduplicateTagInput(cleanedTagInput);

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
    await this.writeDb.transaction(async (trx: Knex.Transaction) => {
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
    const affectedItems = await this.writeDb('item_tags')
      .where({ user_id: this.userId, tag: tagName })
      .pluck('item_id');
    if (affectedItems.length > 0) {
      await this.writeDb.transaction(async (trx: Knex.Transaction) => {
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
    await this.writeDb.transaction(async (trx: Knex.Transaction) => {
      await trx.raw(
        `update ignore item_tags set tag=:newTagName, time_updated=:_updatedAt where user_id = :userId and tag=:oldTagName`,
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
   * todo: make a check if savedItemId exist before deleting.
   */
  public async updateSavedItemTags(
    savedItemTagUpdateInput: SavedItemTagUpdateInput
  ): Promise<void> {
    await this.writeDb.transaction(async (trx: Knex.Transaction) => {
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
  }

  /**
   * deletes all the tags associated with the given savedItem id.
   * if the tag is associated only with the give itemId, then the tag
   * will be deleted too.
   * //todo: make a check if savedItemId exist before deleting.
   * @param savedItemId
   */
  public async updateSavedItemRemoveTags(savedItemId: string): Promise<any> {
    await this.writeDb.transaction(async (trx: Knex.Transaction) => {
      await this.deleteTagsByItemId(savedItemId).transacting(trx);
      await this.savedItemService
        .updateListItemOne(savedItemId)
        .transacting(trx);
      await this.usersMetaService.logTagMutation(new Date(), trx);
    });
  }

  private deleteTagsByItemId(itemId: string): Knex.QueryBuilder {
    return this.writeDb('item_tags')
      .where({ user_id: this.userId, item_id: itemId })
      .del();
  }

  private deleteTagsByName(tagName: string): Knex.QueryBuilder {
    return this.writeDb('item_tags')
      .where({ user_id: this.userId, tag: tagName })
      .del();
  }
}
