import { ApolloServerPlugin } from 'apollo-server-plugin-base';
import { GraphQLError } from 'graphql';
import {
  GraphQLNotFoundError,
  InternalServerError,
  NotFoundError,
} from '../errors';
import { ApolloError } from 'apollo-server-errors';
import * as Sentry from '@sentry/node';

/**
 * Plugin for handling errors.
 * Logs the original error to console (for cloudwatch)
 * and Sentry.
 * This is only invoked if the graphql execution actually
 * started, so it will not send errors that occurred while
 * before the query could start (e.g. syntax error in graphql
 * query sent by client)
 */
export const errorLogger: ApolloServerPlugin = {
  async requestDidStart(initialRequestContext) {
    return {
      async executionDidStart(executionRequestContext) {
        return {
          willResolveField({ source, args, context, info }) {
            return (error, _) => {
              if (error) {
                console.log(error);
                Sentry.addBreadcrumb({
                  message: `Field ${info.parentType.name} failed to resolve`,
                });
                Sentry.captureException(error);
              }
            };
          },
        };
      },
    };
  },
};

/**
 * Used for formatting errors returned to the client. Hide any
 * errors that might reveal server details. Handle special cases
 * that we want to use to provide more information to the client
 * (e.g. NotFoundError).
 */
export function errorHandler(error: GraphQLError): GraphQLError {
  if (error.originalError instanceof NotFoundError) {
    return new GraphQLNotFoundError(error);
  } else if (
    error instanceof ApolloError ||
    error.originalError instanceof ApolloError
  ) {
    // Keep GraphQL errors intact
    // e.g. failed parsing, bad input
    return error;
  } else {
    // Mask other kinds of errors
    return new InternalServerError(error);
  }
}
