import { Injectable, Inject, Scope } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectTenantRepository, TENANT_REPOSITORY_FACTORY, TenantRepositoryFactory } from '../../../src';
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

  async findOne(id: string): Promise<User | null> {
    const repo = await this.userRepository;
    return repo.findOne({ where: { id } });
  }

  async create(userData: Partial<User>): Promise<User> {
    const repo = await this.userRepository;
    const user = repo.create(userData);
    return repo.save(user);
  }

  async update(id: string, userData: Partial<User>): Promise<User | null> {
    const repo = await this.userRepository;
    await repo.update(id, userData);
    return this.findOne(id);
  }

  async delete(id: string): Promise<void> {
    const repo = await this.userRepository;
    await repo.delete(id);
  }

  async createWithTransaction(userData: Partial<User>): Promise<User> {
    return this.repositoryFactory.transaction(async (manager) => {
      const user = manager.create(User, userData);
      return manager.save(user);
    });
  }
}