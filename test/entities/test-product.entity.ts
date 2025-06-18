import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('test_products')
export class TestProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column({ nullable: true })
  description: string;

  @Column({ default: 0 })
  stock: number;
}