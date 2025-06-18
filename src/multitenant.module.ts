import { DynamicModule, Module, Provider } from '@nestjs/common';
import { MULTITENANT_MODULE_OPTIONS, TENANT_DATASOURCE_MANAGER, TENANT_REPOSITORY_FACTORY } from './constants';
import { MultiTenantModuleOptions } from './interfaces';
import { TenantDataSourceManager } from './services/tenant-datasource-manager';
import { TenantContextProvider } from './services/tenant-context-provider';
import { TenantRepositoryFactory } from './services/tenant-repository-factory';

@Module({})
export class MultiTenantModule {
  static forRoot(options: MultiTenantModuleOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: MULTITENANT_MODULE_OPTIONS,
        useValue: options,
      },
      {
        provide: 'TENANT_RESOLVER',
        useClass: options.tenantResolver,
      },
      {
        provide: 'TENANT_CONFIG_PROVIDER', 
        useClass: options.configProvider,
      },
      {
        provide: TENANT_DATASOURCE_MANAGER,
        useClass: TenantDataSourceManager,
      },
      TenantContextProvider,
      {
        provide: TENANT_REPOSITORY_FACTORY,
        useClass: TenantRepositoryFactory,
      },
    ];

    return {
      module: MultiTenantModule,
      providers,
      exports: providers,
      global: true,
    };
  }
}