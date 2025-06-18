import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { TenantContextProvider } from '../../src/services/tenant-context-provider';
import { TenantContext, TenantResolver } from '../../src/interfaces';
import { createMockRequest, TestTenantResolver } from '../utils/test-helpers';

describe('TenantContextProvider', () => {
  let provider: TenantContextProvider;
  let resolver: TenantResolver;
  let mockRequest: Partial<Request>;

  beforeEach(async () => {
    mockRequest = createMockRequest('test-tenant-123');
    resolver = new TestTenantResolver();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantContextProvider,
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
        {
          provide: 'TENANT_RESOLVER',
          useValue: resolver,
        },
      ],
    }).compile();

    // For request-scoped providers, we need to use resolve
    const contextId = { id: 1 };
    provider = await module.resolve<TenantContextProvider>(TenantContextProvider, contextId);
  });

  describe('getContext', () => {
    it('should resolve tenant context from request', async () => {
      const context = await provider.getContext();

      expect(context).toEqual({
        tenantId: 'test-tenant-123',
        metadata: {
          source: 'test-header',
        },
      });
    });

    it('should cache the context after first resolution', async () => {
      const resolveTenantSpy = jest.spyOn(resolver, 'resolveTenant');

      const context1 = await provider.getContext();
      const context2 = await provider.getContext();
      const context3 = await provider.getContext();

      expect(context1).toBe(context2);
      expect(context2).toBe(context3);
      expect(resolveTenantSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle missing tenant ID', async () => {
      const module = await Test.createTestingModule({
        providers: [
          TenantContextProvider,
          {
            provide: REQUEST,
            useValue: createMockRequest(''), // Empty tenant ID
          },
          {
            provide: 'TENANT_RESOLVER',
            useValue: resolver,
          },
        ],
      }).compile();

      const contextId = { id: 2 };
      const errorProvider = await module.resolve<TenantContextProvider>(TenantContextProvider, contextId);

      await expect(errorProvider.getContext()).rejects.toThrow('Tenant ID not found in headers');
    });

    it('should handle async tenant resolution', async () => {
      const asyncResolver: TenantResolver = {
        resolveTenant: async (request: Request): Promise<TenantContext> => {
          // Simulate async operation
          await new Promise(resolve => setTimeout(resolve, 10));
          return {
            tenantId: 'async-tenant',
            metadata: {
              source: 'async',
              timestamp: Date.now(),
            },
          };
        },
      };

      const module = await Test.createTestingModule({
        providers: [
          TenantContextProvider,
          {
            provide: REQUEST,
            useValue: mockRequest,
          },
          {
            provide: 'TENANT_RESOLVER',
            useValue: asyncResolver,
          },
        ],
      }).compile();

      const contextId = { id: 3 };
      const asyncProvider = await module.resolve<TenantContextProvider>(TenantContextProvider, contextId);
      const context = await asyncProvider.getContext();

      expect(context.tenantId).toBe('async-tenant');
      expect(context.metadata.source).toBe('async');
      expect(context.metadata.timestamp).toBeDefined();
    });

    it('should propagate resolver errors', async () => {
      const errorResolver: TenantResolver = {
        resolveTenant: (request: Request): TenantContext => {
          throw new Error('Custom resolver error');
        },
      };

      const module = await Test.createTestingModule({
        providers: [
          TenantContextProvider,
          {
            provide: REQUEST,
            useValue: mockRequest,
          },
          {
            provide: 'TENANT_RESOLVER',
            useValue: errorResolver,
          },
        ],
      }).compile();

      const contextId = { id: 4 };
      const errorProvider = await module.resolve<TenantContextProvider>(TenantContextProvider, contextId);

      await expect(errorProvider.getContext()).rejects.toThrow('Custom resolver error');
    });
  });

  describe('request scoping', () => {
    it('should be request-scoped', () => {
      // The provider is defined with Scope.REQUEST in the implementation
      // The fact that we had to use resolve() instead of get() proves it's request-scoped
      expect(provider).toBeDefined();
    });

    it('should handle different requests independently', async () => {
      // Create two different modules simulating different requests
      const request1 = createMockRequest('tenant-1');
      const request2 = createMockRequest('tenant-2');

      const module1 = await Test.createTestingModule({
        providers: [
          TenantContextProvider,
          {
            provide: REQUEST,
            useValue: request1,
          },
          {
            provide: 'TENANT_RESOLVER',
            useValue: resolver,
          },
        ],
      }).compile();

      const module2 = await Test.createTestingModule({
        providers: [
          TenantContextProvider,
          {
            provide: REQUEST,
            useValue: request2,
          },
          {
            provide: 'TENANT_RESOLVER',
            useValue: resolver,
          },
        ],
      }).compile();

      const contextId1 = { id: 5 };
      const contextId2 = { id: 6 };
      const provider1 = await module1.resolve<TenantContextProvider>(TenantContextProvider, contextId1);
      const provider2 = await module2.resolve<TenantContextProvider>(TenantContextProvider, contextId2);

      const context1 = await provider1.getContext();
      const context2 = await provider2.getContext();

      expect(context1.tenantId).toBe('tenant-1');
      expect(context2.tenantId).toBe('tenant-2');
      expect(provider1).not.toBe(provider2);
    });
  });
});