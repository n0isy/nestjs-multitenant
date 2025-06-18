import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { createServer, LogLevel } from './pglite-server';
import { startServerAfterTries } from './start-server-after-tries';

export type PgInstance = {
  lite: PGlite;
  server: any;
  pool: Pool;
  connectionString: string;
  port: number;
  tenantId: string;
};

export type MultiPg = {
  instances: Map<string, PgInstance>;
  teardown: () => Promise<void>;
  getConnectionString: (tenantId: string) => string;
};

export async function getMultiPostgres(
  tenantIds: string[],
  logLevel: LogLevel = LogLevel.Error
): Promise<MultiPg> {
  const { uuid_ossp } = require('@electric-sql/pglite/contrib/uuid_ossp');
  const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
  
  const instances = new Map<string, PgInstance>();

  // Create separate PGlite instance for each tenant
  for (const tenantId of tenantIds) {
    // Create truly isolated instance with unique identifier
    const uniqueId = `${tenantId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const lite = new PGlite({ 
      extensions: { uuid_ossp, pg_trgm },
      dataDir: `memory://${uniqueId}` // Unique in-memory database
    });
    await lite.waitReady;

    const server = createServer(lite, { logLevel });
    const port = await startServerAfterTries(server);
    const connectionString = `postgresql://postgres:postgres@localhost:${port}/postgres`;

    const pool = new Pool({ connectionString });

    instances.set(tenantId, {
      lite,
      server,
      pool,
      connectionString,
      port,
      tenantId,
    });
  }

  const teardown = async () => {
    for (const instance of instances.values()) {
      await instance.pool.end();
      await new Promise<void>((resolve, reject) => {
        instance.server.close((err: Error | undefined) => {
          if (err) reject(err);
          resolve();
        });
      });
      await instance.lite.close();
    }
    instances.clear();
  };

  const getConnectionString = (tenantId: string): string => {
    const instance = instances.get(tenantId);
    if (!instance) {
      throw new Error(`No PostgreSQL instance found for tenant: ${tenantId}`);
    }
    return instance.connectionString;
  };

  return {
    instances,
    teardown,
    getConnectionString,
  };
}