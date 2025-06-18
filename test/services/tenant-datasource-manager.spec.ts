import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TenantDataSourceManager } from '../../src/services/tenant-datasource-manager';
import { MULTITENANT_MODULE_OPTIONS } from '../../src/constants';
import { MultiTenantModuleOptions, TenantContext } from '../../src/interfaces';
import { TestDatabaseConfigProvider } from '../utils/test-helpers';
import { TestUser } from '../entities/test-user.entity';
import { TestProduct } from '../entities/test-product.entity';
import { Pg, getPostgres } from '../tools/get-postgres';
import { createTestDatabases, cleanupTestDatabases } from '../utils/database-setup';

describe('TenantDataSourceManager', () => {
  let pg: Pg;
  let manager: TenantDataSourceManager;
  let configProvider: TestDatabaseConfigProvider;
  let moduleOptions: MultiTenantModuleOptions;
  const testTenants = ['tenant1', 'tenant2', 'tenant3'];

  beforeAll(async () => {
    pg = await getPostgres();
    await createTestDatabases(pg, testTenants);
  }, 30000);

  afterAll(async () => {
    await cleanupTestDatabases(pg, testTenants);
    await pg.teardown();
  }, 30000);

  beforeEach(async () => {
    configProvider = new TestDatabaseConfigProvider(
      pg.connectionString,
      [TestUser, TestProduct]
    );

    moduleOptions = {
      tenantResolver: null as any,
      configProvider: null as any,
      connectionTimeout: 5000,
      idleTimeout: 10000,
      debug: false,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantDataSourceManager,
        {
          provide: MULTITENANT_MODULE_OPTIONS,
          useValue: moduleOptions,
        },
        {
          provide: 'TENANT_CONFIG_PROVIDER',
          useValue: configProvider,
        },
      ],
    }).compile();

    manager = module.get<TenantDataSourceManager>(TenantDataSourceManager);
  });

  afterEach(async () => {
    await manager.closeAll();
    // Clean up databases to avoid conflicts
    await cleanupTestDatabases(pg, testTenants);
    await createTestDatabases(pg, testTenants);
  });

  describe('getDataSource', () => {
    it('should create a new DataSource for a tenant', async () => {
      const context: TenantContext = { tenantId: 'tenant1' };
      
      const dataSource = await manager.getDataSource(context);
      
      expect(dataSource).toBeInstanceOf(DataSource);
      expect(dataSource.isInitialized).toBe(true);
      
      // Check that entities are registered
      const userRepo = dataSource.getRepository(TestUser);
      expect(userRepo).toBeDefined();
    });

    it('should return the same DataSource for the same tenant', async () => {
      const context: TenantContext = { tenantId: 'tenant1' };
      
      const dataSource1 = await manager.getDataSource(context);
      const dataSource2 = await manager.getDataSource(context);
      
      expect(dataSource1).toBe(dataSource2);
    });

    it('should create different DataSources for different tenants', async () => {
      const context1: TenantContext = { tenantId: 'tenant1' };
      const context2: TenantContext = { tenantId: 'tenant2' };
      
      const dataSource1 = await manager.getDataSource(context1);
      const dataSource2 = await manager.getDataSource(context2);
      
      expect(dataSource1).not.toBe(dataSource2);
      expect(dataSource1.options.database).toBe('test_tenant_tenant1');
      expect(dataSource2.options.database).toBe('test_tenant_tenant2');
    });

    it('should handle multiple concurrent tenant connections', async () => {
      const contexts = testTenants.map(id => ({ tenantId: id }));
      
      const dataSources = await Promise.all(
        contexts.map(context => manager.getDataSource(context))
      );
      
      expect(dataSources).toHaveLength(testTenants.length);
      expect(new Set(dataSources).size).toBe(testTenants.length);
      
      // Verify all are initialized
      dataSources.forEach(ds => {
        expect(ds.isInitialized).toBe(true);
      });
    });

    it('should apply default options from module configuration', async () => {
      const customOptions: MultiTenantModuleOptions = {
        ...moduleOptions,
        defaultDataSourceOptions: {
          extra: {
            max: 5,
            customOption: 'test',
          },
        },
      };

      const module = await Test.createTestingModule({
        providers: [
          TenantDataSourceManager,
          {
            provide: MULTITENANT_MODULE_OPTIONS,
            useValue: customOptions,
          },
          {
            provide: 'TENANT_CONFIG_PROVIDER',
            useValue: configProvider,
          },
        ],
      }).compile();

      const customManager = module.get<TenantDataSourceManager>(TenantDataSourceManager);
      const context: TenantContext = { tenantId: 'tenant1' };
      
      const dataSource = await customManager.getDataSource(context);
      
      expect((dataSource.options as any).extra.customOption).toBe('test');
      
      await customManager.closeAll();
    });
  });

  describe('closeAll', () => {
    it('should close all DataSource connections', async () => {
      const contexts = testTenants.map(id => ({ tenantId: id }));
      
      const dataSources = await Promise.all(
        contexts.map(context => manager.getDataSource(context))
      );
      
      await manager.closeAll();
      
      dataSources.forEach(ds => {
        expect(ds.isInitialized).toBe(false);
      });
    });

    it('should clear internal DataSource map after closing', async () => {
      const context: TenantContext = { tenantId: 'tenant1' };
      
      await manager.getDataSource(context);
      const stats1 = manager.getStats();
      expect(stats1.activeConnections).toBe(1);
      
      await manager.closeAll();
      
      const stats2 = manager.getStats();
      expect(stats2.activeConnections).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const stats1 = manager.getStats();
      expect(stats1.activeConnections).toBe(0);
      expect(stats1.tenants).toEqual([]);
      
      await manager.getDataSource({ tenantId: 'tenant1' });
      await manager.getDataSource({ tenantId: 'tenant2' });
      
      const stats2 = manager.getStats();
      expect(stats2.activeConnections).toBe(2);
      expect(stats2.tenants).toContain('tenant1');
      expect(stats2.tenants).toContain('tenant2');
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors', async () => {
      const errorProvider = new TestDatabaseConfigProvider(
        'postgresql://invalid:invalid@localhost:99999/invalid',
        []
      );

      const module = await Test.createTestingModule({
        providers: [
          TenantDataSourceManager,
          {
            provide: MULTITENANT_MODULE_OPTIONS,
            useValue: moduleOptions,
          },
          {
            provide: 'TENANT_CONFIG_PROVIDER',
            useValue: errorProvider,
          },
        ],
      }).compile();

      const errorManager = module.get<TenantDataSourceManager>(TenantDataSourceManager);
      const context: TenantContext = { tenantId: 'tenant1' };
      
      await expect(errorManager.getDataSource(context)).rejects.toThrow();
    });
  });
});