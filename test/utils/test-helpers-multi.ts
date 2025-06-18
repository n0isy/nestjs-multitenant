import { Injectable } from '@nestjs/common';
import { DataSourceOptions } from 'typeorm';
import { TenantContext, TenantConfigProvider } from '../../src';
import { TestUser } from '../entities/test-user.entity';
import { TestProduct } from '../entities/test-product.entity';
import { MultiPg } from '../tools/get-multi-postgres';

/**
 * Test config provider that uses separate PostgreSQL instances per tenant
 */
@Injectable()
export class TestMultiInstanceConfigProvider implements TenantConfigProvider {
  constructor(
    private multiPg: MultiPg,
    private entities: any[] = [TestUser, TestProduct]
  ) {}

  getTenantConfig(context: TenantContext): DataSourceOptions {
    const connectionString = this.multiPg.getConnectionString(context.tenantId);
    
    return {
      type: 'postgres',
      url: connectionString,
      entities: this.entities,
      synchronize: true,
      logging: false,
      dropSchema: false,
    };
  }
}