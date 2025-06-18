import { DataSourceOptions } from 'typeorm';
import { Request } from 'express';
import { ModuleMetadata, Type } from '@nestjs/common';

export interface TenantContext {
  tenantId: string;
  metadata?: Record<string, any>;
}

export interface TenantResolver {
  resolveTenant(request: Request): Promise<TenantContext> | TenantContext;
}

export interface TenantConfigProvider {
  getTenantConfig(context: TenantContext): Promise<DataSourceOptions> | DataSourceOptions;
}

export interface MultiTenantModuleOptions {
  tenantResolver: Type<TenantResolver>;
  configProvider: Type<TenantConfigProvider>;
  
  connectionTimeout?: number;
  idleTimeout?: number;
  
  defaultDataSourceOptions?: Partial<DataSourceOptions>;
  
  enableMetrics?: boolean;
  debug?: boolean;
}

export interface MultiTenantModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory?: (...args: any[]) => Promise<MultiTenantModuleOptions> | MultiTenantModuleOptions;
  inject?: any[];
  useClass?: Type<MultiTenantModuleOptionsFactory>;
  useExisting?: Type<MultiTenantModuleOptionsFactory>;
}

export interface MultiTenantModuleOptionsFactory {
  createMultiTenantOptions(): Promise<MultiTenantModuleOptions> | MultiTenantModuleOptions;
}