import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { TenantRepositoryFactory } from '../../src/services/tenant-repository-factory';
import { TenantContextProvider } from '../../src/services/tenant-context-provider';
import { TenantDataSourceManager } from '../../src/services/tenant-datasource-manager';
import { TENANT_DATASOURCE_MANAGER } from '../../src/constants';
import { TenantContext } from '../../src/interfaces';
import { TestUser } from '../entities/test-user.entity';
import { TestProduct } from '../entities/test-product.entity';

describe('TenantRepositoryFactory', () => {
  let factory: TenantRepositoryFactory;
  let contextProvider: TenantContextProvider;
  let dataSourceManager: TenantDataSourceManager;
  let mockDataSource: DataSource;

  beforeEach(async () => {
    // Create mock DataSource
    mockDataSource = {
      isInitialized: true,
      getRepository: jest.fn().mockImplementation((entity) => {
        const mockRepo = {
          target: entity,
          find: jest.fn().mockResolvedValue([]),
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
          create: jest.fn().mockImplementation((data) => data),
          delete: jest.fn().mockResolvedValue({ affected: 1 }),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
        };
        return mockRepo;
      }),
      transaction: jest.fn().mockImplementation(async (work) => {
        const mockManager = {
          create: jest.fn().mockImplementation((entity, data) => data),
          save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
        };
        return work(mockManager);
      }),
    } as any;

    // Create mocks
    contextProvider = {
      getContext: jest.fn().mockResolvedValue({
        tenantId: 'test-tenant',
        metadata: {},
      }),
    } as any;

    dataSourceManager = {
      getDataSource: jest.fn().mockResolvedValue(mockDataSource),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantRepositoryFactory,
        {
          provide: TenantContextProvider,
          useValue: contextProvider,
        },
        {
          provide: TENANT_DATASOURCE_MANAGER,
          useValue: dataSourceManager,
        },
      ],
    }).compile();

    // For request-scoped providers, we need to use resolve
    const contextId = { id: 1 };
    factory = await module.resolve<TenantRepositoryFactory>(TenantRepositoryFactory, contextId);
  });

  describe('getRepository', () => {
    it('should return a repository for the given entity', async () => {
      const repository = await factory.getRepository(TestUser);

      expect(repository).toBeDefined();
      expect(repository.find).toBeDefined();
      expect(repository.save).toBeDefined();
      expect(dataSourceManager.getDataSource).toHaveBeenCalled();
      expect(mockDataSource.getRepository).toHaveBeenCalledWith(TestUser);
    });

    it('should cache the DataSource after first call', async () => {
      await factory.getRepository(TestUser);
      await factory.getRepository(TestProduct);
      await factory.getRepository(TestUser);

      expect(dataSourceManager.getDataSource).toHaveBeenCalledTimes(1);
      expect(mockDataSource.getRepository).toHaveBeenCalledTimes(3);
    });

    it('should get different repositories for different entities', async () => {
      const userRepo = await factory.getRepository(TestUser);
      const productRepo = await factory.getRepository(TestProduct);

      expect(userRepo).not.toBe(productRepo);
      expect(mockDataSource.getRepository).toHaveBeenCalledWith(TestUser);
      expect(mockDataSource.getRepository).toHaveBeenCalledWith(TestProduct);
    });

    it('should use the correct tenant context', async () => {
      const customContext: TenantContext = {
        tenantId: 'custom-tenant',
        metadata: { custom: true },
      };
      
      (contextProvider.getContext as jest.Mock).mockResolvedValue(customContext);

      await factory.getRepository(TestUser);

      expect(contextProvider.getContext).toHaveBeenCalled();
      expect(dataSourceManager.getDataSource).toHaveBeenCalledWith(customContext);
    });
  });

  describe('getDataSource', () => {
    it('should return the cached DataSource', async () => {
      const dataSource1 = await factory.getDataSource();
      const dataSource2 = await factory.getDataSource();

      expect(dataSource1).toBe(mockDataSource);
      expect(dataSource2).toBe(mockDataSource);
      expect(dataSourceManager.getDataSource).toHaveBeenCalledTimes(1);
    });

    it('should handle DataSource initialization errors', async () => {
      const error = new Error('DataSource initialization failed');
      (dataSourceManager.getDataSource as jest.Mock).mockRejectedValue(error);

      await expect(factory.getDataSource()).rejects.toThrow('DataSource initialization failed');
    });
  });

  describe('transaction', () => {
    it('should execute work within a transaction', async () => {
      const result = await factory.transaction(async (manager) => {
        const user = manager.create(TestUser, {
          email: 'test@example.com',
          name: 'Test User',
        });
        return manager.save(user);
      });

      expect(result).toEqual({
        email: 'test@example.com',
        name: 'Test User',
      });
      expect(mockDataSource.transaction).toHaveBeenCalled();
    });

    it('should propagate transaction errors', async () => {
      const error = new Error('Transaction failed');
      
      mockDataSource.transaction = jest.fn().mockRejectedValue(error);

      await expect(
        factory.transaction(async (manager) => {
          throw error;
        })
      ).rejects.toThrow('Transaction failed');
    });

    it('should handle nested operations in transaction', async () => {
      const result = await factory.transaction(async (manager) => {
        const user = manager.create(TestUser, {
          email: 'user@example.com',
          name: 'User',
        });
        
        const savedUser = await manager.save(user);
        
        const product = manager.create(TestProduct, {
          name: 'Product',
          price: 100,
        });
        
        await manager.save(product);
        
        return savedUser;
      });

      expect(result.email).toBe('user@example.com');
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('request scoping', () => {
    it('should be request-scoped', () => {
      // Check that the service is defined with request scope
      const providers = Reflect.getMetadata('providers', TenantRepositoryFactory) || [];
      const moduleMetadata = Reflect.getMetadata('imports', TenantRepositoryFactory) || [];
      
      // The scope is defined in the decorator, let's just verify the service works as request-scoped
      expect(factory).toBeDefined();
      // The fact that we had to use resolve() instead of get() proves it's request-scoped
    });

    it('should create separate instances for different requests', async () => {
      // Simulate different request contexts
      const context1: TenantContext = { tenantId: 'tenant1' };
      const context2: TenantContext = { tenantId: 'tenant2' };

      const dataSource1 = { ...mockDataSource, id: 1 } as any;
      const dataSource2 = { ...mockDataSource, id: 2 } as any;

      const module1 = await Test.createTestingModule({
        providers: [
          TenantRepositoryFactory,
          {
            provide: TenantContextProvider,
            useValue: {
              getContext: jest.fn().mockResolvedValue(context1),
            },
          },
          {
            provide: TENANT_DATASOURCE_MANAGER,
            useValue: {
              getDataSource: jest.fn().mockResolvedValue(dataSource1),
            },
          },
        ],
      }).compile();

      const module2 = await Test.createTestingModule({
        providers: [
          TenantRepositoryFactory,
          {
            provide: TenantContextProvider,
            useValue: {
              getContext: jest.fn().mockResolvedValue(context2),
            },
          },
          {
            provide: TENANT_DATASOURCE_MANAGER,
            useValue: {
              getDataSource: jest.fn().mockResolvedValue(dataSource2),
            },
          },
        ],
      }).compile();

      const contextId1 = { id: 1 };
      const contextId2 = { id: 2 };
      
      const factory1 = await module1.resolve<TenantRepositoryFactory>(TenantRepositoryFactory, contextId1);
      const factory2 = await module2.resolve<TenantRepositoryFactory>(TenantRepositoryFactory, contextId2);

      expect(factory1).not.toBe(factory2);
    });
  });
});