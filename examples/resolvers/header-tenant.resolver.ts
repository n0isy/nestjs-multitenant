import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { TenantResolver, TenantContext } from '../../src';

@Injectable()
export class HeaderTenantResolver implements TenantResolver {
  resolveTenant(request: Request): TenantContext {
    const tenantId = request.headers['x-tenant-id'] as string;
    
    if (!tenantId) {
      throw new Error('Tenant ID not found in headers');
    }

    return {
      tenantId,
      metadata: {
        source: 'header',
        userAgent: request.headers['user-agent'],
      },
    };
  }
}