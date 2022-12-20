import path from 'path';
import fs from 'fs';
import { gql } from 'graphql-tag';

export const getSchemaFiles = () => {
  return ['schema.graphql', 'saves.schema.graphql'].map((filename: string) => {
    return gql(
      fs.readFileSync(path.join(__dirname, '..', '..', filename)).toString()
    );
  });
};

export const typeDefs = getSchemaFiles();
