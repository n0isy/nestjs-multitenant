import { Injectable, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { TenantContext, TenantResolver } from '../interfaces';

@Injectable({ scope: Scope.REQUEST })
export class TenantContextProvider {
  private _context: TenantContext | null = null;

  constructor(
    @Inject(REQUEST) private request: Request,
    @Inject('TENANT_RESOLVER') private tenantResolver: TenantResolver,
  ) {}

  async getContext(): Promise<TenantContext> {
    if (!this._context) {
      this._context = await this.tenantResolver.resolveTenant(this.request);
    }
    return this._context;
  }
}