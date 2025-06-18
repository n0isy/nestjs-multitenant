# @nestjs-multitenant/core

A simple multi-tenant library for NestJS with TypeORM that manages DataSource instances per tenant.

## Features

- Request-scoped tenant resolution
- Per-tenant TypeORM DataSource management
- Automatic connection pooling per DataSource
- Support for different tenant isolation strategies (database-per-tenant, schema-per-tenant)
- Injectable tenant repositories
- Transaction support

## Installation

```bash
npm install @nestjs-multitenant/core
```

## Quick Start

### 1. Implement a Tenant Resolver

```typescript
import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { TenantResolver, TenantContext } from '@nestjs-multitenant/core';

@Injectable()
export class HeaderTenantResolver implements TenantResolver {
  resolveTenant(request: Request): TenantContext {
    const tenantId = request.headers['x-tenant-id'] as string;
    
    if (!tenantId) {
      throw new Error('Tenant ID not found in headers');
    }

    return { tenantId };
  }
}
```

### 2. Implement a Config Provider

```typescript
import { Injectable } from '@nestjs/common';
import { DataSourceOptions } from 'typeorm';
import { TenantConfigProvider, TenantContext } from '@nestjs-multitenant/core';

@Injectable()
export class DatabasePerTenantConfigProvider implements TenantConfigProvider {
  getTenantConfig(context: TenantContext): DataSourceOptions {
    return {
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'password',
      database: `tenant_${context.tenantId}`,
      entities: [User, Product],
      synchronize: false,
    };
  }
}
```

### 3. Configure the Module

```typescript
import { Module } from '@nestjs/common';
import { MultiTenantModule } from '@nestjs-multitenant/core';

@Module({
  imports: [
    MultiTenantModule.forRoot({
      tenantResolver: HeaderTenantResolver,
      configProvider: DatabasePerTenantConfigProvider,
      debug: true,
    }),
  ],
})
export class AppModule {}
```

### 4. Use in Services

```typescript
import { Injectable, Inject, Scope } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectTenantRepository, TENANT_REPOSITORY_FACTORY, TenantRepositoryFactory } from '@nestjs-multitenant/core';
import { User } from './user.entity';

@Injectable({ scope: Scope.REQUEST })
export class UserService {
  @InjectTenantRepository(User)
  private userRepository: Promise<Repository<User>>;

  constructor(
    @Inject(TENANT_REPOSITORY_FACTORY)
    private repositoryFactory: TenantRepositoryFactory,
  ) {}

  async findAll(): Promise<User[]> {
    const repo = await this.userRepository;
    return repo.find();
  }

  async createWithTransaction(userData: Partial<User>): Promise<User> {
    return this.repositoryFactory.transaction(async (manager) => {
      const user = manager.create(User, userData);
      return manager.save(user);
    });
  }
}
```

## API Reference

### Interfaces

- `TenantContext` - Contains tenant identification information
- `TenantResolver` - Interface for extracting tenant context from requests
- `TenantConfigProvider` - Interface for providing tenant-specific database configuration
- `MultiTenantModuleOptions` - Module configuration options

### Decorators

- `@InjectTenantRepository(Entity)` - Inject a tenant-specific repository
- `@InjectTenantContext()` - Inject the tenant context provider
- `@InjectTenantDataSource()` - Inject the tenant data source manager

### Services

- `TenantDataSourceManager` - Manages DataSource instances per tenant
- `TenantContextProvider` - Request-scoped service holding tenant context
- `TenantRepositoryFactory` - Creates repositories for the current tenant

## Examples

See the `/examples` directory for complete examples including:
- Header-based tenant resolution
- Subdomain-based tenant resolution
- Database-per-tenant configuration
- Schema-per-tenant configuration

## License

MIT