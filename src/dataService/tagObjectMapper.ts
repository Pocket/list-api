import { Tag } from '../types';
import * as Sentry from '@sentry/node';

export type TagModel = {
  userId: string;
  name: string;
  id: string;
  savedItems: string;
  _updatedAt?: number;
  _createdAt?: number;
  _version?: number;
  _deletedAt?: number;
};

export class TagObjectMapper {
  public static mapDbModelToDomainEntity(tagModel?: any): Tag {
    TagObjectMapper.validateTagFields(tagModel);
    return {
      id: tagModel.id,
      name: tagModel.name,
      _createdAt: tagModel._createdAt,
      _updatedAt: tagModel._updatedAt,
      _deletedAt: tagModel._deletedAt,
      _version: tagModel._version,
      savedItems: tagModel.savedItems.split(','),
    };
  }

  public static mapDomainEntityToDbModel(tagEntity: Tag): TagModel {
    TagObjectMapper.validateTagFields(tagEntity);
    return {
      id: tagEntity.id,
      userId: null,
      name: tagEntity.name,
      _createdAt: tagEntity._createdAt,
      _updatedAt: tagEntity._updatedAt,
      _deletedAt: tagEntity._deletedAt,
      _version: tagEntity._version,
      savedItems: tagEntity.savedItems.join(','),
    };
  }

  private static validateTagFields(tagModel: any): boolean {
    const tagModelFields: { field: string; required?: boolean }[] = [
      { field: 'userId', required: true },
      { field: 'name', required: true },
      { field: 'id', required: true },
      { field: 'savedItems', required: true },
      { field: '_updatedAt', required: false },
      { field: '_createdAt', required: false },
      { field: '_version', required: false },
      { field: '_deletedAt', required: false },
    ];

    let err: string;
    for (const property of tagModelFields) {
      if (!Object.prototype.hasOwnProperty.call(tagModel, property.field)) {
        err = `unable to find the property : ${property.field} from the database query}`;
      } else if (property.required && !tagModel[property.field]) {
        err = `field : ${
          property.field
        } is null or empty in object ${JSON.stringify(tagModel)}`;
      }
    }

    if (err) {
      Sentry.captureException(err);
      throw new Error(err);
    }
    return true;
  }
}
