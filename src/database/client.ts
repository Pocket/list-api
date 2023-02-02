import knex, { Knex } from 'knex';
import config from '../config';

let readDb: Knex;
let writeDb: Knex;

/**
 * Create a db client for reads from readitla_ril-tmp
 */
export function readClient(): Knex {
  if (readDb) return readDb;

  readDb = createConnection(config.database.read);

  return readDb;
}

/**
 * Create a db client for writes to readitla_ril-tmp
 */
export function writeClient(): Knex {
  if (writeDb) return writeDb;

  writeDb = createConnection(config.database.write);

  return writeDb;
}

/**
 * Create a db connection
 * @param dbConfig
 * @param database
 */
export function createConnection(dbConfig: {
  host: string;
  port: string;
  user: string;
  password: string;
  clientType: string;
}): Knex {
  const { host, port, user, password, clientType } = dbConfig;

  return knex({
    client: 'mysql',
    searchPath: clientType,
    acquireConnectionTimeout: 6000, // ms
    connection: {
      charset: 'utf8mb4',
      database: config.database.dbName,
      host: host,
      password: password,
      port: parseInt(port),
      user: user,
    },
    pool: {
      min: 0, //knex docs state to set to 0 so that idle connections are released. Default was 2 for legacy knex reasons (according to docs)
      max: 1000, // current RDS max connections is 5k (SHOW GLOBAL VARIABLES LIKE 'max_connections)
      /**
       * Explicitly set the session timezone. We don't want to take any chances with this
       */
      afterCreate: (connection, callback) => {
        connection.query(`SET time_zone = '${config.database.tz}';`, (err) => {
          callback(err, connection);
        });
      },
    },
  });
}
