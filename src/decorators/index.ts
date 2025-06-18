import { Inject } from '@nestjs/common';
import { EntityTarget } from 'typeorm';
import { TENANT_REPOSITORY_FACTORY } from '../constants';
import { TenantRepositoryFactory } from '../services/tenant-repository-factory';
import { TenantContextProvider } from '../services/tenant-context-provider';
import { TenantDataSourceManager } from '../services/tenant-datasource-manager';

export function InjectTenantRepository<T>(entity: EntityTarget<T>) {
  return function (target: any, propertyName: string) {
    const repositoryGetter = async function(this: any) {
      if (!this._repositoryCache) {
        this._repositoryCache = new Map();
      }
      
      if (!this._repositoryCache.has(entity)) {
        const factory: TenantRepositoryFactory = this[TENANT_REPOSITORY_FACTORY];
        const repository = await factory.getRepository(entity);
        this._repositoryCache.set(entity, repository);
      }
      
      return this._repositoryCache.get(entity);
    };

    Object.defineProperty(target, propertyName, {
      get: repositoryGetter,
      enumerable: true,
      configurable: true,
    });

    Inject(TENANT_REPOSITORY_FACTORY)(target, TENANT_REPOSITORY_FACTORY);
  };
}

export const InjectTenantContext = () => Inject(TenantContextProvider);
export const InjectTenantDataSource = () => Inject(TenantDataSourceManager);