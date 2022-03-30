import { readClient } from '../../database/client';
import { ApolloServer, gql } from 'apollo-server-express';
import { buildSubgraphSchema } from '@apollo/federation';
import { errorHandler, errorLogger } from '../../plugins';
import { UserInputError } from 'apollo-server-errors';
import chai, { expect } from 'chai';
import { NotFoundError } from '../../errors';
import sinon from 'sinon';
import * as Sentry from '@sentry/node';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';

chai.use(deepEqualInAnyOrder);

// Fake resolvers that throw errors
async function badSql() {
  const db = readClient();
  const res = await db('faketable').select();
  return res as Book[];
}

function notFound() {
  throw new NotFoundError('book id');
}

function badUserInput() {
  throw new UserInputError('Bad input');
}

// Simple graphql toy server and types
type Book = {
  title: string;
  author: string;
};

const typeDefs = gql`
  type Book {
    title: String
    author: String
  }
  type Query {
    books: [Book]
    lostBook: Book
    foundBook: Book
    badBook: Book
  }
`;
const resolvers = {
  Query: {
    books: badSql,
    lostBook: notFound,
    foundBook: () => ({ title: 'Slaughterhouse 5', author: 'Kurt Vonnegut' }),
    badBook: badUserInput,
  },
};
const server = new ApolloServer({
  schema: buildSubgraphSchema({ typeDefs, resolvers }),
  plugins: [errorLogger],
  formatError: errorHandler,
});

describe('Server error handling: ', () => {
  const consoleSpy = sinon.spy(console, 'log');
  const sentrySpy = sinon.spy(Sentry, 'captureException');

  afterEach(() => {
    consoleSpy.resetHistory();
    sentrySpy.resetHistory();
  });

  it('throws a generic server error if not a special case', async () => {
    const query = gql`
      query {
        books {
          title
        }
      }
    `;
    const res = await server.executeOperation({ query });
    expect(res.errors.length).to.equal(1);
    const error = res.errors[0];
    expect(error.message).to.equal('Internal server error');
    expect(error.extensions.code).to.equal('INTERNAL_SERVER_ERROR');
    // Just passing through, so check if not undefined
    expect(error.path).to.not.be.undefined;
    expect(error.locations).to.not.be.undefined;
    // Check the original error got logged and sent to sentry
    [consoleSpy, sentrySpy].forEach((spy) => {
      expect(spy.calledOnce).to.be.true;
      expect(spy.getCall(0).args[0].message).to.contain('ER_NO_SUCH_TABLE');
      expect(spy.getCall(0).args[0].stack).to.not.be.undefined;
    });
  });
  it('throws a not found error', async () => {
    const query = gql`
      query {
        lostBook {
          title
        }
      }
    `;
    const res = await server.executeOperation({ query });
    expect(res.errors.length).to.equal(1);
    const error = res.errors[0];
    expect(error.message).to.equal('Error - Not Found: book id');
    expect(error.extensions.code).to.equal('NOT_FOUND');
    // Just passing through, so check if not undefined
    expect(error.path).to.not.be.undefined;
    expect(error.locations).to.not.be.undefined;
    // Check the original error got logged and sent to sentry
    [consoleSpy, sentrySpy].forEach((spy) => {
      expect(spy.calledOnce).to.be.true;
      expect(spy.getCall(0).args[0].message).to.equal(
        'Error - Not Found: book id'
      );
      expect(spy.getCall(0).args[0].stack).to.not.be.undefined;
    });
  });
  it('Can handle multiple errors and still resolve data', async () => {
    const query = gql`
      query {
        lostBook {
          title
          author
        }
        foundBook {
          title
          author
        }
        books {
          title
          author
        }
      }
    `;
    const res = await server.executeOperation({ query });
    expect(res.errors.length).to.equal(2);
    const messages = res.errors.map((error) => error.message);
    expect(messages).to.deep.equalInAnyOrder([
      'Error - Not Found: book id',
      'Internal server error',
    ]);
    const expectedData = {
      lostBook: null,
      foundBook: { title: 'Slaughterhouse 5', author: 'Kurt Vonnegut' },
      books: null,
    };
    expect(res.data).to.deep.equal(expectedData);
  });
  it('does not mask validation errors or send to sentry/log', async () => {
    const query = gql`
      query {
        lostBook {
          invalidField
        }
      }
    `;
    const res = await server.executeOperation({ query });
    expect(res.errors.length).to.equal(1);
    expect(res.errors[0].message).to.contain('Cannot query field');
    [consoleSpy, sentrySpy].forEach((spy) => {
      expect(spy.callCount).to.equal(0);
    });
  });
  it('does not mask parsing/syntax errors', async () => {
    const query = `
      query {
        lostBook {
        }
      }
    `;

    const res = await server.executeOperation({ query });
    expect(res.errors.length).to.equal(1);
    expect(res.errors[0].message).to.contain('Syntax Error');
    [consoleSpy, sentrySpy].forEach((spy) => {
      expect(spy.callCount).to.equal(0);
    });
  });
  it('does not mask errors from apollo-server-errors raised by application', async () => {
    const query = `
    query {
      badBook {
        title
      }
    }
  `;
    const res = await server.executeOperation({ query });
    expect(res.errors.length).to.equal(1);
    expect(res.errors[0].message).to.contain('Bad input');
    // Check the original error got logged and sent to sentry
    // This is raised during the resolver, so will trigger sending errors
    [consoleSpy, sentrySpy].forEach((spy) => {
      expect(spy.calledOnce).to.be.true;
      expect(spy.getCall(0).args[0].message).to.contain('Bad input');
      expect(spy.getCall(0).args[0].stack).to.not.be.undefined;
    });
  });
});
