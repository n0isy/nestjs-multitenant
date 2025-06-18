import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DataSourceOptions } from 'typeorm';
import { TenantResolver, TenantContext, TenantConfigProvider } from '../../src';
import { TestUser } from '../entities/test-user.entity';
import { TestProduct } from '../entities/test-product.entity';

export { TenantResolver, TenantContext, TenantConfigProvider };

/**
 * Mock request object for testing
 */
export const createMockRequest = (tenantId: string): Partial<Request> => {
  return {
    headers: {
      'x-tenant-id': tenantId,
      'user-agent': 'test-agent',
    } as any,
    get: (name: string) => {
      if (name === 'host') {
        return `${tenantId}.example.com`;
      }
      return undefined as any;
    },
  } as any;
};

/**
 * Test tenant resolver that uses headers
 */
@Injectable()
export class TestTenantResolver implements TenantResolver {
  resolveTenant(request: Request): TenantContext {
    const tenantId = request.headers['x-tenant-id'] as string;
    
    if (!tenantId || tenantId.trim() === '') {
      throw new Error('Tenant ID not found in headers');
    }

    return {
      tenantId,
      metadata: {
        source: 'test-header',
      },
    };
  }
}

/**
 * Test config provider that creates databases per tenant
 */
@Injectable()
export class TestDatabaseConfigProvider implements TenantConfigProvider {
  constructor(
    private connectionString: string,
    private entities: any[] = [TestUser, TestProduct]
  ) {}

  getTenantConfig(context: TenantContext): DataSourceOptions {
    // Parse the base connection string to build tenant-specific URL
    const baseUrl = new URL(this.connectionString);
    const tenantDatabase = `test_tenant_${context.tenantId}`;
    
    // Build a new connection string with the tenant database
    const tenantUrl = `${baseUrl.protocol}//${baseUrl.username}:${baseUrl.password}@${baseUrl.host}/${tenantDatabase}`;
    
    return {
      type: 'postgres',
      url: tenantUrl,
      entities: this.entities,
      synchronize: true,
      logging: false,
      dropSchema: false, // Don't drop schema automatically
    };
  }
}

/**
 * Test config provider that uses schemas per tenant
 */
@Injectable()
export class TestSchemaConfigProvider implements TenantConfigProvider {
  constructor(
    private connectionString: string,
    private entities: any[] = [TestUser, TestProduct]
  ) {}

  getTenantConfig(context: TenantContext): DataSourceOptions {
    return {
      type: 'postgres',
      url: this.connectionString,
      schema: `tenant_${context.tenantId}`,
      entities: this.entities,
      synchronize: true,
      logging: false,
      dropSchema: true, // Clean schema for each test
    };
  }
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('Timeout waiting for condition');
}