import { Test } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';
import { 
  InjectTenantContext, 
  InjectTenantDataSource,
  InjectTenantRepository
} from '../../src/decorators';
import { TenantContextProvider } from '../../src/services/tenant-context-provider';
import { TenantDataSourceManager } from '../../src/services/tenant-datasource-manager';
import { TENANT_REPOSITORY_FACTORY } from '../../src/constants';
import { TestUser } from '../entities/test-user.entity';

describe('Decorators', () => {
  describe('InjectTenantContext', () => {
    it('should inject TenantContextProvider', async () => {
      @Injectable()
      class TestService {
        constructor(
          @InjectTenantContext()
          public contextProvider: TenantContextProvider,
        ) {}
      }

      const module = await Test.createTestingModule({
        providers: [
          TestService,
          {
            provide: TenantContextProvider,
            useValue: { getContext: jest.fn() },
          },
        ],
      }).compile();

      const service = module.get(TestService);
      expect(service.contextProvider).toBeDefined();
      expect(service.contextProvider.getContext).toBeDefined();
    });
  });

  describe('InjectTenantDataSource', () => {
    it('should inject TenantDataSourceManager', async () => {
      @Injectable()
      class TestService {
        constructor(
          @InjectTenantDataSource()
          public dataSourceManager: TenantDataSourceManager,
        ) {}
      }

      const module = await Test.createTestingModule({
        providers: [
          TestService,
          {
            provide: TenantDataSourceManager,
            useValue: { getDataSource: jest.fn() },
          },
        ],
      }).compile();

      const service = module.get(TestService);
      expect(service.dataSourceManager).toBeDefined();
      expect(service.dataSourceManager.getDataSource).toBeDefined();
    });
  });

  describe('InjectTenantRepository cache', () => {
    it('should cache repository instances', async () => {
      const mockRepository = { find: jest.fn() };
      const mockFactory = {
        getRepository: jest.fn().mockResolvedValue(mockRepository),
      };

      @Injectable()
      class TestService {
        @InjectTenantRepository(TestUser)
        private userRepository: any;

        constructor() {
          // Inject the mock factory directly for testing
          (this as any)[TENANT_REPOSITORY_FACTORY] = mockFactory;
        }

        async getRepository() {
          return this.userRepository;
        }
      }

      const service = new TestService();
      
      // First access should call getRepository
      const repo1 = await service.getRepository();
      expect(mockFactory.getRepository).toHaveBeenCalledTimes(1);
      expect(repo1).toBe(mockRepository);
      
      // Second access should use cache
      const repo2 = await service.getRepository();
      expect(mockFactory.getRepository).toHaveBeenCalledTimes(1); // Still 1
      expect(repo2).toBe(mockRepository);
    });
  });
});