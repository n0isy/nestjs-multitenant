import { Injectable, Inject, Scope } from '@nestjs/common';
import { DataSource, Repository, EntityTarget, EntityManager } from 'typeorm';
import { TENANT_DATASOURCE_MANAGER } from '../constants';
import { TenantDataSourceManager } from './tenant-datasource-manager';
import { TenantContextProvider } from './tenant-context-provider';

@Injectable({ scope: Scope.REQUEST })
export class TenantRepositoryFactory {
  private dataSource: DataSource | null = null;

  constructor(
    private contextProvider: TenantContextProvider,
    @Inject(TENANT_DATASOURCE_MANAGER)
    private dataSourceManager: TenantDataSourceManager,
  ) {}

  async getRepository<Entity>(entity: EntityTarget<Entity>): Promise<Repository<Entity>> {
    const dataSource = await this.getDataSource();
    return dataSource.getRepository(entity);
  }

  async getDataSource(): Promise<DataSource> {
    if (!this.dataSource) {
      const context = await this.contextProvider.getContext();
      this.dataSource = await this.dataSourceManager.getDataSource(context);
    }
    return this.dataSource;
  }

  async transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const dataSource = await this.getDataSource();
    return dataSource.transaction(work);
  }
}