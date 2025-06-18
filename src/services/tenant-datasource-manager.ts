import { Injectable, Inject } from '@nestjs/common';
import { DataSource, DataSourceOptions } from 'typeorm';
import { MULTITENANT_MODULE_OPTIONS } from '../constants';
import { MultiTenantModuleOptions, TenantContext, TenantConfigProvider } from '../interfaces';

@Injectable()
export class TenantDataSourceManager {
  private dataSources = new Map<string, DataSource>();

  constructor(
    @Inject(MULTITENANT_MODULE_OPTIONS)
    private options: MultiTenantModuleOptions,
    @Inject('TENANT_CONFIG_PROVIDER')
    private configProvider: TenantConfigProvider,
  ) {}

  async getDataSource(context: TenantContext): Promise<DataSource> {
    const { tenantId } = context;
    
    if (this.dataSources.has(tenantId)) {
      return this.dataSources.get(tenantId)!;
    }

    const dataSource = await this.createTenantDataSource(context);
    this.dataSources.set(tenantId, dataSource);

    return dataSource;
  }

  private async createTenantDataSource(context: TenantContext): Promise<DataSource> {
    const tenantConfig = await this.configProvider.getTenantConfig(context);
    
    const config = {
      ...this.options.defaultDataSourceOptions,
      ...tenantConfig,
      extra: {
        max: 2,
        idleTimeoutMillis: this.options.idleTimeout || 30000,
        connectionTimeoutMillis: this.options.connectionTimeout || 5000,
        ...this.options.defaultDataSourceOptions?.extra,
        ...tenantConfig.extra,
      },
    } as DataSourceOptions;

    const dataSource = new DataSource(config);
    await dataSource.initialize();

    if (this.options.debug) {
      console.log(`[MultiTenant] Created DataSource for tenant: ${context.tenantId}`);
    }

    return dataSource;
  }


  async closeAll(): Promise<void> {
    for (const [tenantId, dataSource] of this.dataSources) {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    }
    this.dataSources.clear();
  }

  getStats() {
    return {
      activeConnections: this.dataSources.size,
      tenants: Array.from(this.dataSources.keys()),
    };
  }
}