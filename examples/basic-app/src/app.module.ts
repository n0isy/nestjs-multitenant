import { Module } from '@nestjs/common';
import { MultiTenantModule } from '../../../src';
import { HeaderTenantResolver } from '../../resolvers/header-tenant.resolver';
import { DatabasePerTenantConfigProvider } from '../../config-providers/database-per-tenant.provider';
import { UserService } from './user.service';
import { User } from './user.entity';

@Module({
  imports: [
    MultiTenantModule.forRoot({
      tenantResolver: HeaderTenantResolver,
      configProvider: DatabasePerTenantConfigProvider,
      connectionTimeout: 5000,
      idleTimeout: 30000,
      debug: true,
      defaultDataSourceOptions: {
        entities: [User],
        logging: false,
        extra: {
          max: 2,
        },
      },
    }),
  ],
  providers: [UserService],
})
export class AppModule {}