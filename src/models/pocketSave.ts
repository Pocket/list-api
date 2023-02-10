import { PocketSave, saveArchiveInput } from '../types';
import { IContext } from '../server/context';
import { ListResult, PocketSaveDataService } from '../dataService';
import { NotFoundError } from '@pocket-tools/apollo-utils';

export class PocketSaveModel {
  private saveService: PocketSaveDataService;
  constructor(public readonly context: IContext) {
    this.saveService = new PocketSaveDataService(this.context);
  }

  /**
   * Transform List Row into PocketSave
   * @param row the List Table Row to transform
   */
  static transformListRow(row: ListResult): PocketSave {
    const result: PocketSave = {
      archived: row.status === 'ARCHIVED' ? true : false,
      archivedAt: row.status === 'ARCHIVED' ? row.time_read : null,
      createdAt: row.time_added,
      deletedAt: row.status === 'DELETED' ? row.time_updated : null,
      favorite: row.favorite === 1 ? true : false,
      favoritedAt: row.favorite === 1 ? row.time_favorited : null,
      givenUrl: row.given_url,
      id: row.item_id.toString(),
      status: row.status,
      title: row.title,
      updatedAt: row.time_updated,
    };

    return result;
  }

  /**
   * * Fetch a PocketSave by its ID
   * * @param id the ID of the PocketSave to retrieve
   * @throws NotFoundError if the PocketSave does not exist
   * @returns the PocketSave entity
   */
  public async getById(id: string): Promise<PocketSave> {
    const listRow = await this.saveService.getListRowById(id);
    if (listRow === undefined || listRow === null) {
      throw new NotFoundError(`Saved Item with ID=${id} does not exist.`);
    }
    const pocketSave = PocketSaveModel.transformListRow(listRow);
    return pocketSave;
  }

  public async saveArchive(input: saveArchiveInput): Promise<PocketSave> {
    const response = await this.saveService.saveArchive(input);
    return null;
  }
}
