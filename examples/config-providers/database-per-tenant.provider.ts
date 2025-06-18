import { Injectable } from '@nestjs/common';
import { DataSourceOptions } from 'typeorm';
import { TenantConfigProvider, TenantContext } from '../../src';

@Injectable()
export class DatabasePerTenantConfigProvider implements TenantConfigProvider {
  getTenantConfig(context: TenantContext): DataSourceOptions {
    return {
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'postgres', 
      password: process.env.DB_PASSWORD || 'password',
      database: `tenant_${context.tenantId}`,
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV === 'development',
    };
  }
}

@Injectable() 
export class SchemaPerTenantConfigProvider implements TenantConfigProvider {
  getTenantConfig(context: TenantContext): DataSourceOptions {
    return {
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'password', 
      database: process.env.DB_DATABASE || 'multitenant_db',
      schema: `tenant_${context.tenantId}`,
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      synchronize: process.env.NODE_ENV !== 'production',
    };
  }
}