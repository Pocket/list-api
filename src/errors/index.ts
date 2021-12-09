import { ApolloError } from 'apollo-server-errors';
import { GraphQLError } from 'graphql';

export class NotFoundError extends Error {
  constructor(message?: string) {
    super(`Error - Not Found: ${message}`); // 'Error' breaks prototype chain here
    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
  }
}

export class CustomGraphQLError extends ApolloError {
  constructor(
    error: GraphQLError,
    code: string,
    name: string,
    message?: string
  ) {
    // keep original message unless override
    super(message ?? error.message, code);

    Object.defineProperty(this, 'name', { value: name });
    // GraphQL only keeps these values (plus extensions and message)
    //   when re-throwing the error, so set them
    // They don't contain sensitive info
    Object.defineProperty(this, 'path', { value: error.path });
    Object.defineProperty(this, 'locations', { value: error.locations });
  }
}

export class InternalServerError extends CustomGraphQLError {
  constructor(error: GraphQLError) {
    super(
      error,
      'INTERNAL_SERVER_ERROR',
      'InternalServerError',
      'Internal server error'
    );
  }
}

export class GraphQLNotFoundError extends CustomGraphQLError {
  constructor(error: GraphQLError) {
    super(error, 'NOT_FOUND', 'NotFoundError');
  }
}
