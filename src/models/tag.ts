import {
  SavedItemTagUpdateInput,
  Tag,
  SavedItem,
  TagCreateInput,
  SaveTagNameConnection,
  DeleteSavedItemTagsInput,
  TagUpdateInput,
  SavedItemTagsInput,
  DeleteSaveTagResponse,
  PocketSave,
} from '../types';
import config from '../config';
import { IContext } from '../server/context';
import { SavedItemDataService, TagDataService } from '../dataService';
import { NotFoundError, UserInputError } from '@pocket-tools/apollo-utils';
import { addslashes } from 'locutus/php/strings';
import * as Sentry from '@sentry/node';

export class TagModel {
  private tagService: TagDataService;
  private saveService: SavedItemDataService;
  constructor(public readonly context: IContext) {
    this.saveService = new SavedItemDataService(this.context);
    this.tagService = new TagDataService(this.context, this.saveService);
  }

  /**
   * Convert data layer response to GraphQL Tag entity
   * Ensures the required fields are there.
   * This is mostly to catch developer error since the
   * data model in the db does not match the GraphQL entity
   */
  public static toGraphqlEntity(tagResponse: any): Tag {
    validateTag(tagResponse);
    return {
      ...tagResponse,
      savedItems: tagResponse.savedItems.split(','),
    };
  }

  /**
   * Generate the ID from the DB representation of tag association
   * Centralizing this logic since it is not modeled in the DB
   *
   * @param parent parent Tag entity resolving the ID on
   * @returns the generated ID for the Tag
   */
  public resolveId(parent: Tag): string {
    return TagModel.encodeId(parent.name);
  }

  /**
   * Decode the ID generated from the tag name text
   * @param id the ID to decode
   * @returns the tag name text
   */
  public static decodeId(id: string): string {
    const decoded = Buffer.from(id, 'base64').toString();
    const replace = `${config.data.tagIdSuffix}$`;
    const regex = new RegExp(replace);
    return decoded.replace(regex, '');
  }

  /**
   * Encode an ID from a tag's name text
   * @param name the tag name text
   * @returns the encoded ID
   */
  public static encodeId(name: string): string {
    return Buffer.from(name + config.data.tagIdSuffix).toString('base64');
  }

  /**
   * Associate one or more tags to a save
   */
  public async createTagSaveConnections(
    inputs: SavedItemTagsInput[]
  ): Promise<SavedItem[]> {
    const creates: TagCreateInput[] = sanitizeTagCreateInput(
      inputs.flatMap((input) =>
        input.tags.map((name) => ({
          savedItemId: input.savedItemId,
          name,
        }))
      )
    );
    await this.tagService.insertTags(creates);
    const saveIds = creates.map((_) => _.savedItemId);
    return this.saveService.batchGetSavedItemsByGivenIds(saveIds);
  }

  /**
   * Replace the tags associated with a save
   */
  public updateTagSaveConnections(
    updates: SavedItemTagUpdateInput
  ): Promise<SavedItem> {
    const creates: TagCreateInput[] = updates.tagIds.map((tagId) => {
      return {
        name: TagModel.decodeId(tagId),
        savedItemId: updates.savedItemId,
      };
    });
    const sanitized = sanitizeTagCreateInput(creates);
    const sanitizedIds = sanitized.map(({ savedItemId }) => savedItemId);
    // Validate just in case
    const deleteFromSaveId = new Set(sanitizedIds);
    if (deleteFromSaveId.size != 1) {
      throw new UserInputError('Cannot update Tags on multiple Saves');
    }
    return this.tagService.updateSavedItemTags(sanitized);
  }

  /**
   * Replace the tags associated with one or more saves in
   * in a single batch.
   */
  public replaceTagSaveConnections(tags: TagCreateInput[]) {
    const sanitizedInput = sanitizeTagCreateInput(tags);
    return this.tagService.replaceSavedItemTags(sanitizedInput);
  }

  /**
   * Fetch a Tag by its ID
   * @param id the ID of the Tag to retrieve
   * @throws NotFoundError if the record does not exist
   * @returns the Tag entity
   */
  public getById(id: string): Promise<Tag> {
    const name = TagModel.decodeId(id);
    const tag = this.tagService.getTagByName(name);
    if (tag == null) {
      throw new NotFoundError(`Tag with ID=${id} does not exist.`);
    }
    return tag;
  }

  public async getBySaveId(id: string): Promise<Tag[]> {
    return this.tagService.getTagsByUserItem(id);
  }

  /**
   * Get paginated saved item tags
   * @param parent
   */
  public async getSuggestedBySaveId(parent: PocketSave): Promise<Tag[] | []> {
    if (!this.context.userIsPremium) {
      // Suggested Tags is a premium feature.
      return [];
    }

    return this.tagService.getSuggestedTags(parent);
  }

  /**
   * Remove one or more tags from one or more saves, in a batch.
   * @param deletes delete requests
   * @returns the updated saves, with the list of tag names deleted
   */
  public async deleteTagSaveConnection(
    deletes: DeleteSavedItemTagsInput[]
  ): Promise<DeleteSaveTagResponse[]> {
    // Explode tag ids list keyed on Save into list of save:tagName
    const nameConnections: SaveTagNameConnection[] = deletes.flatMap((save) =>
      save.tagIds.map((tagId) => ({
        savedItemId: save.savedItemId,
        tagName: TagModel.decodeId(tagId),
      }))
    );
    const saveIds = deletes.map((_) => _.savedItemId);
    await this.tagService.deleteSavedItemAssociations(nameConnections);
    const saves = await this.saveService.batchGetSavedItemsByGivenIds(saveIds);
    return deletes.map((del) => ({
      removed: del.tagIds.map(TagModel.decodeId),
      save: saves.find((save) => del.savedItemId === save.id.toString()),
    }));
  }

  /**
   * Rename a tag entity. Propogates to all saves it is associated to.
   * @param tag the ID of the tag and its new name
   * @returns the updated Tag
   */
  public async renameTag(tag: TagUpdateInput): Promise<Tag> {
    const oldTag = await this.getById(tag.id);
    if (oldTag == null) {
      throw new NotFoundError(`Tag Id ${tag.id} does not exist`);
    }
    const newName = sanitizeTagName(tag.name);
    await this.tagService.updateTagByUser(
      oldTag.name,
      newName,
      oldTag.savedItems
    );
    return this.tagService.getTagByName(newName);
  }

  /**
   * Delete a Tag. Removes all associations with any saves.
   * @param id the Tag ID to delete
   * @returns the id
   */
  public async deleteTag(id: string): Promise<string> {
    const name = TagModel.decodeId(id);
    await this.tagService.deleteTagObject(name);
    return id;
  }

  /**
   * Clear all tags from a Save
   * @param saveId the Save to clear tags from
   * @throws NotFoundError if the Save does not exist
   * @returns the updated Save and a list of tag names removed
   */
  public async removeSaveTags(saveId: string): Promise<DeleteSaveTagResponse> {
    const tagsCleared = await this.tagService.getTagsByUserItem(saveId);
    const removed = tagsCleared.map((_) => _.name);
    const save = await this.tagService.updateSavedItemRemoveTags(saveId);
    if (save == null) {
      throw new NotFoundError(`SavedItem Id ${saveId} does not exist`);
    }
    return { save, removed };
  }

  /**
   * Replace the tags associated with one or more saves in
   * in a single batch.
   */
  public async replaceSaveTagConnections(
    replacements: SavedItemTagsInput[]
  ): Promise<SavedItem[]> {
    const tagCreates: TagCreateInput[] = replacements.flatMap((replacement) =>
      replacement.tags.map((tag) => ({
        savedItemId: replacement.savedItemId,
        name: sanitizeTagName(tag),
      }))
    );
    return this.tagService.replaceSavedItemTags(tagCreates);
  }
  // TODO: These weren't required for the ID thing
  //   public getPage(pagination: Pagination): Promise<TagConnection> {}
  //   public getSuggestedTags() {}
  //   public getBySave() {}
  //   public removeTagSaveConnections {}
}

/**
 * Processes tag inputs prior to insertion/query in the database.
 * Performs the following:
 *  1. Convert to lowercase
 *  2. Trim whitespace
 *  3. Replace the unicode replacement character with ?, if present
 *  4. Truncate to 25 characters (an emoji counts as 1 character even if
 *     represented with multiple code points)
 *  5. Apply php addslashes function (ported to ts)
 *  6. Validates that the tag string is not empty, else throws an error
 *
 * TODO: Let's decide on some kind
 * of validation library or figure out how to enforce
 * input constraints on the GraphQL schema
 * @param tagName the raw tag string
 * @returns string: the cleaned tag
 * @throws Error if cleaning results in an empty string
 */

export function sanitizeTagName(name: string) {
  const strippedTag = Array.from(
    name
      .replace(new RegExp('\uFFFD', 'g'), '?') // unicode replacement character
      .trim()
      .toLowerCase()
  )
    .slice(0, 25)
    .join('');
  if (strippedTag.length === 0) {
    throw new UserInputError(
      'Tag name must have at least 1 non-whitespace character.'
    );
  }
  return addslashes(strippedTag);
}

/**
 * Validate that any query response that returns a Tag from
 * the database can be parsed correctly into the GraphQL entity (contains
 * the required fields).
 * This is more to ensure that the developer has returned all
 * required fields from queries, since the data model does not match
 * the graphql entity.
 */
const validateTag = (tag: any): true => {
  const tagModelFields: { field: string; required?: boolean }[] = [
    { field: 'name', required: true },
    { field: 'savedItems', required: true },
    { field: '_updatedAt', required: false },
    { field: '_createdAt', required: false },
    { field: '_version', required: false },
    { field: '_deletedAt', required: false },
  ];

  let err: string;
  for (const property of tagModelFields) {
    if (!Object.prototype.hasOwnProperty.call(tag, property.field)) {
      err = `unable to find the property : ${property.field} from the database query}`;
    } else if (property.required && tag[property.field] == null) {
      err = `field : ${property.field} is null in object ${JSON.stringify(
        tag
      )}`;
    }
  }

  if (err) {
    Sentry.captureException(err);
    throw new Error(err);
  }
  return true;
};

/**
 * Deduplicate a batch of tags prior to inserting in the
 * database. Compares values for all keys of the TagCreateInput type.
 * The keys aren't available until compile time, but if they get changed
 * the linter should remind the dev to update.
 * Best if this method is run after tags are 'cleaned'.
 */
export function deduplicateTagInput(
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
 * Deduplicate and and sanitize tag create inputs.
 * Convenience function.
 * TODO: Input constraints on schema?
 */
const sanitizeTagCreateInput = (
  tagInputs: TagCreateInput[]
): TagCreateInput[] => {
  const input = deduplicateTagInput(tagInputs).map(({ name, savedItemId }) => {
    return {
      name: sanitizeTagName(name),
      savedItemId,
    };
  });
  if (input.length === 0) {
    throw new UserInputError('Must provide 1 or more values for tag mutations');
  }
  return input;
};
