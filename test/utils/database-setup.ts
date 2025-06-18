import { Pool } from 'pg';
import { Pg } from '../tools/get-postgres';

/**
 * Creates test databases for multi-tenant testing
 */
export async function createTestDatabases(
  pg: Pg,
  tenantIds: string[]
): Promise<void> {
  const adminPool = new Pool({
    connectionString: pg.connectionString,
  });

  try {
    for (const tenantId of tenantIds) {
      const dbName = `test_tenant_${tenantId}`;
      
      // Drop database if exists
      await adminPool.query(
        `DROP DATABASE IF EXISTS ${dbName}`
      );
      
      // Create new database
      await adminPool.query(
        `CREATE DATABASE ${dbName}`
      );
    }
  } finally {
    await adminPool.end();
  }
}

/**
 * Creates test schemas for multi-tenant testing
 */
export async function createTestSchemas(
  pg: Pg,
  databaseName: string,
  tenantIds: string[]
): Promise<void> {
  const pool = new Pool({
    connectionString: `${pg.connectionString}/${databaseName}`,
  });

  try {
    // Create the database first
    const adminPool = new Pool({ connectionString: pg.connectionString });
    await adminPool.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await adminPool.query(`CREATE DATABASE ${databaseName}`);
    await adminPool.end();

    // Create schemas in the new database
    for (const tenantId of tenantIds) {
      const schemaName = `tenant_${tenantId}`;
      
      await pool.query(
        `DROP SCHEMA IF EXISTS ${schemaName} CASCADE`
      );
      
      await pool.query(
        `CREATE SCHEMA ${schemaName}`
      );
    }
  } finally {
    await pool.end();
  }
}

/**
 * Cleans up test databases
 */
export async function cleanupTestDatabases(
  pg: Pg,
  tenantIds: string[]
): Promise<void> {
  const adminPool = new Pool({
    connectionString: pg.connectionString,
  });

  try {
    for (const tenantId of tenantIds) {
      const dbName = `test_tenant_${tenantId}`;
      
      // Terminate connections and drop database
      await adminPool.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = '${dbName}'
          AND pid <> pg_backend_pid()
      `);
      
      await adminPool.query(
        `DROP DATABASE IF EXISTS ${dbName}`
      );
    }
  } finally {
    await adminPool.end();
  }
}

/**
 * Helper to get database statistics
 */
export async function getDatabaseStats(
  pg: Pg
): Promise<{ databases: string[], connections: number }> {
  const pool = new Pool({
    connectionString: pg.connectionString,
  });

  try {
    const dbResult = await pool.query(
      `SELECT datname FROM pg_database WHERE datistemplate = false`
    );
    
    const connResult = await pool.query(
      `SELECT count(*) FROM pg_stat_activity`
    );
    
    return {
      databases: dbResult.rows.map(row => row.datname),
      connections: parseInt(connResult.rows[0].count),
    };
  } finally {
    await pool.end();
  }
}