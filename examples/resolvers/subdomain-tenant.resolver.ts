import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { TenantResolver, TenantContext } from '../../src';

@Injectable()
export class SubdomainTenantResolver implements TenantResolver {
  resolveTenant(request: Request): TenantContext {
    const host = request.get('host');
    
    if (!host) {
      throw new Error('Host header not found');
    }

    const subdomain = host.split('.')[0];
    
    if (!subdomain || subdomain === 'www' || subdomain === 'api') {
      throw new Error('Invalid subdomain for tenant resolution');
    }

    return {
      tenantId: subdomain,
      metadata: {
        source: 'subdomain',
        host,
      },
    };
  }
}