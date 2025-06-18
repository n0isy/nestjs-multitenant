import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Injectable, Module, Scope, Inject } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Pg, getPostgres } from './tools/get-postgres';
import { MultiTenantModule } from '../src/multitenant.module';
import { 
  InjectTenantRepository, 
  TENANT_REPOSITORY_FACTORY,
  TenantRepositoryFactory,
  TenantDataSourceManager,
  TENANT_DATASOURCE_MANAGER,
} from '../src';
import { TestUser } from './entities/test-user.entity';
import { TestProduct } from './entities/test-product.entity';
import { 
  TestTenantResolver, 
  TestDatabaseConfigProvider,
  createMockRequest,
  TenantConfigProvider,
} from './utils/test-helpers';
import { createTestDatabases, cleanupTestDatabases } from './utils/database-setup';
import { DataSourceOptions } from 'typeorm';
import { TenantContext } from '../src/interfaces';

// Test service using decorators
@Injectable({ scope: Scope.REQUEST })
class TestUserService {
  @InjectTenantRepository(TestUser)
  private userRepository: Promise<Repository<TestUser>>;

  @InjectTenantRepository(TestProduct)
  private productRepository: Promise<Repository<TestProduct>>;

  constructor(
    @Inject(TENANT_REPOSITORY_FACTORY)
    private repositoryFactory: TenantRepositoryFactory,
  ) {}

  async createUser(email: string, name: string): Promise<TestUser> {
    const repo = await this.userRepository;
    const user = repo.create({ email, name });
    return repo.save(user);
  }

  async findAllUsers(): Promise<TestUser[]> {
    const repo = await this.userRepository;
    return repo.find();
  }

  async createProduct(name: string, price: number): Promise<TestProduct> {
    const repo = await this.productRepository;
    const product = repo.create({ name, price });
    return repo.save(product);
  }

  async createUserWithTransaction(email: string, name: string): Promise<TestUser> {
    return this.repositoryFactory.transaction(async (manager) => {
      const user = manager.create(TestUser, { email, name });
      return manager.save(user);
    });
  }
}

// Test module
@Module({
  providers: [TestUserService],
})
class TestAppModule {}

describe('MultiTenantModule Integration', () => {
  let pg: Pg;
  let app: INestApplication;
  let moduleRef: TestingModule;
  let configProvider: TestDatabaseConfigProvider;
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

    // Create a custom config provider class for this test
    @Injectable()
    class TestConfigProviderWithConnection implements TenantConfigProvider {
      getTenantConfig(context: TenantContext): DataSourceOptions {
        return configProvider.getTenantConfig(context);
      }
    }

    moduleRef = await Test.createTestingModule({
      imports: [
        MultiTenantModule.forRoot({
          tenantResolver: TestTenantResolver,
          configProvider: TestConfigProviderWithConnection,
          debug: false,
          defaultDataSourceOptions: {
            entities: [TestUser, TestProduct],
          },
        }),
        TestAppModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      const dataSourceManager = app.get(TENANT_DATASOURCE_MANAGER) as TenantDataSourceManager;
      await dataSourceManager.closeAll();
      await app.close();
    }
  });

  describe('Module Setup', () => {
    it('should register all providers globally', () => {
      expect(moduleRef.get(TENANT_DATASOURCE_MANAGER)).toBeDefined();
      expect(moduleRef.get(TENANT_REPOSITORY_FACTORY)).toBeDefined();
      expect(moduleRef.get('TENANT_RESOLVER')).toBeDefined();
      expect(moduleRef.get('TENANT_CONFIG_PROVIDER')).toBeDefined();
    });

    it('should use the provided resolver and config provider', () => {
      const resolver = moduleRef.get('TENANT_RESOLVER');
      const configProv = moduleRef.get('TENANT_CONFIG_PROVIDER');

      expect(resolver).toBeInstanceOf(TestTenantResolver);
      expect(configProv).toBeDefined();
      expect(configProv.getTenantConfig).toBeDefined();
    });
  });

  describe('Multi-tenant Operations', () => {
    it('should isolate data between tenants', async () => {
      // Create request-scoped providers for different tenants
      const contextId1 = { id: 1 };
      const contextId2 = { id: 2 };

      // Set up request contexts
      moduleRef.registerRequestByContextId(createMockRequest('tenant1'), contextId1);
      moduleRef.registerRequestByContextId(createMockRequest('tenant2'), contextId2);

      // Get services for each tenant
      const service1 = await moduleRef.resolve(TestUserService, contextId1);
      const service2 = await moduleRef.resolve(TestUserService, contextId2);

      // Create users in different tenants
      await service1.createUser('user1@tenant1.com', 'User 1');
      await service1.createUser('user2@tenant1.com', 'User 2');
      
      await service2.createUser('user1@tenant2.com', 'User 1');
      await service2.createUser('user2@tenant2.com', 'User 2');
      await service2.createUser('user3@tenant2.com', 'User 3');

      // Verify isolation
      const users1 = await service1.findAllUsers();
      const users2 = await service2.findAllUsers();

      expect(users1).toHaveLength(2);
      expect(users2).toHaveLength(3);
      
      expect(users1.every(u => u.email.includes('tenant1'))).toBe(true);
      expect(users2.every(u => u.email.includes('tenant2'))).toBe(true);
    });

    it('should support multiple entity types per tenant', async () => {
      const contextId = { id: 1 };
      moduleRef.registerRequestByContextId(createMockRequest('tenant1'), contextId);
      
      const service = await moduleRef.resolve(TestUserService, contextId);

      await service.createUser('test@example.com', 'Test User');
      await service.createProduct('Test Product', 99.99);

      const users = await service.findAllUsers();
      expect(users).toHaveLength(1);
      
      // Product operations work independently
      const product = await service.createProduct('Another Product', 149.99);
      expect(product.name).toBe('Another Product');
    });

    it('should support transactions', async () => {
      const contextId = { id: 1 };
      moduleRef.registerRequestByContextId(createMockRequest('tenant1'), contextId);
      
      const service = await moduleRef.resolve(TestUserService, contextId);

      const user = await service.createUserWithTransaction(
        'transaction@example.com',
        'Transaction User'
      );

      expect(user.email).toBe('transaction@example.com');
      
      const users = await service.findAllUsers();
      expect(users).toHaveLength(1);
    });

    it('should handle concurrent requests to different tenants', async () => {
      const contexts = testTenants.map((tenant, index) => ({
        id: index,
        tenant,
      }));

      // Register all contexts
      contexts.forEach(ctx => {
        moduleRef.registerRequestByContextId(createMockRequest(ctx.tenant), ctx);
      });

      // Resolve all services
      const services = await Promise.all(
        contexts.map(ctx => moduleRef.resolve(TestUserService, ctx))
      );

      // Create users concurrently
      await Promise.all(
        services.map((service, index) => 
          service.createUser(`user@${contexts[index].tenant}.com`, `User ${index}`)
        )
      );

      // Verify each tenant has exactly one user
      const allUsers = await Promise.all(
        services.map(service => service.findAllUsers())
      );

      allUsers.forEach((users, index) => {
        expect(users).toHaveLength(1);
        expect(users[0].email).toBe(`user@${contexts[index].tenant}.com`);
      });
    });
  });

  describe('DataSource Management', () => {
    it('should create separate DataSources for each tenant', async () => {
      const dataSourceManager = app.get(TENANT_DATASOURCE_MANAGER) as TenantDataSourceManager;
      
      const stats1 = dataSourceManager.getStats();
      expect(stats1.activeConnections).toBe(0);

      // Create services for different tenants
      const contexts = ['tenant1', 'tenant2'].map((tenant, index) => ({
        id: index,
        tenant,
      }));

      contexts.forEach(ctx => {
        moduleRef.registerRequestByContextId(createMockRequest(ctx.tenant), ctx);
      });

      const services = await Promise.all(
        contexts.map(ctx => moduleRef.resolve(TestUserService, ctx))
      );

      // Trigger DataSource creation
      await Promise.all(
        services.map(service => service.findAllUsers())
      );

      const stats2 = dataSourceManager.getStats();
      expect(stats2.activeConnections).toBe(2);
      expect(stats2.tenants).toContain('tenant1');
      expect(stats2.tenants).toContain('tenant2');
    });

    it('should clean up DataSources on closeAll', async () => {
      const dataSourceManager = app.get(TENANT_DATASOURCE_MANAGER) as TenantDataSourceManager;
      
      const contextId = { id: 1 };
      moduleRef.registerRequestByContextId(createMockRequest('tenant1'), contextId);
      
      const service = await moduleRef.resolve(TestUserService, contextId);
      await service.findAllUsers();

      expect(dataSourceManager.getStats().activeConnections).toBe(1);

      await dataSourceManager.closeAll();

      expect(dataSourceManager.getStats().activeConnections).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing tenant ID', async () => {
      const contextId = { id: 1 };
      moduleRef.registerRequestByContextId(createMockRequest(''), contextId);
      
      await expect(
        moduleRef.resolve(TestUserService, contextId)
      ).rejects.toThrow('Tenant ID not found in headers');
    });

    it('should handle database connection errors gracefully', async () => {
      // Create a new module with invalid database config
      const errorModule = await Test.createTestingModule({
        imports: [
          MultiTenantModule.forRoot({
            tenantResolver: TestTenantResolver,
            configProvider: class InvalidConfigProvider {
              getTenantConfig() {
                return {
                  type: 'postgres',
                  url: 'postgresql://invalid:invalid@localhost:99999/invalid',
                  entities: [TestUser],
                };
              }
            } as any,
          }),
          TestAppModule,
        ],
      }).compile();

      const errorApp = errorModule.createNestApplication();
      await errorApp.init();

      const contextId = { id: 1 };
      errorModule.registerRequestByContextId(createMockRequest('tenant1'), contextId);
      
      const service = await errorModule.resolve(TestUserService, contextId);
      
      await expect(service.findAllUsers()).rejects.toThrow();

      await errorApp.close();
    });
  });
});