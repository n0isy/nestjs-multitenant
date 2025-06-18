import { Injectable } from '@nestjs/common';
import { DataSourceOptions } from 'typeorm';
import { TenantConfigProvider, TenantContext } from '../../src';
import { PGlite } from '@electric-sql/pglite';

// Store PGlite instances for cleanup
export const pgliteInstances = new Map<string, PGlite>();

@Injectable()
export class PGliteTestConfigProvider implements TenantConfigProvider {
  private entities: any[] = [];

  constructor(entities?: any[]) {
    if (entities) {
      this.entities = entities;
    }
  }

  async getTenantConfig(context: TenantContext): Promise<DataSourceOptions> {
    // Create a unique PGlite instance for each tenant
    const pglite = new PGlite();
    pgliteInstances.set(context.tenantId, pglite);

    // Get the connection string from PGlite
    // PGlite provides a special connection string that TypeORM can use
    const connectionString = await this.getPGliteConnectionString(pglite);

    return {
      type: 'postgres',
      url: connectionString,
      entities: this.entities,
      synchronize: true, // Auto-create schema for tests
      logging: false,
      extra: {
        // Use the PGlite instance directly
        pgConnection: pglite,
      },
    } as DataSourceOptions;
  }

  private async getPGliteConnectionString(pglite: PGlite): Promise<string> {
    // PGlite doesn't provide a direct connection string, so we need to create a custom driver
    // For now, we'll use a placeholder that will be handled by our custom driver
    return `pglite://memory/${Math.random().toString(36).substring(7)}`;
  }
}

// Helper function to clean up all PGlite instances
export async function cleanupPGliteInstances() {
  for (const [tenantId, pglite] of pgliteInstances) {
    await pglite.close();
  }
  pgliteInstances.clear();
}