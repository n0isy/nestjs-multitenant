import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
// import { createServer, LogLevel } from 'pglite-server';
import { createServer, LogLevel } from './pglite-server';
import { startServerAfterTries } from './start-server-after-tries';

export type PgLitePoolOptions = {
  port?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logLevel?: LogLevel;
};

export type Pg = {
  pool: Pool;
  connectionString: string;
  port: number;
  teardown: () => Promise<void>;
};

export async function getPostgres(
  options: PgLitePoolOptions = {}
): Promise<Pg> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { uuid_ossp } = require('@electric-sql/pglite/contrib/uuid_ossp');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');

  const lite = new PGlite({ extensions: { uuid_ossp, pg_trgm } });
  await lite.waitReady;

  const pgServer = createServer(lite, {
    logLevel: options.logLevel || LogLevel.Error,
  });

  // Await listening
  const port = await startServerAfterTries(pgServer);

  const connectionString = `postgresql://postgres:postgres@localhost:${port}/postgres`;

  const pool = new Pool({
    connectionString,
  });

  const teardown = async () => {
    await pool.end();
    await new Promise<void>((resolve, reject) => {
      pgServer.close((err: Error | undefined) => {
        if (err) reject(err);
        resolve();
      });
    });
    await lite.close();
  };

  return {
    pool,
    port,
    connectionString,
    teardown,
  };
}
