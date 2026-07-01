import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClientMembership } from './client-membership.entity';
import { Gender } from '../enums/gender.enum';

/**
 * Global identity of a client (the person being coached).
 *
 * A client exists independently of any tenant; their relationship to a tenant
 * is expressed through {@link ClientMembership} rows. This lets the same client
 * be invited into multiple tenants and switch between them, while per-tenant
 * concerns (status, block reason) live on the membership.
 */
@Entity()
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true, unique: true })
  username: string;

  @Column({ nullable: true, select: false })
  password: string;

  @Column({ nullable: true, unique: true })
  googleId: string;

  @Column({ nullable: true })
  profilePicture: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender;

  @Column({ type: 'date', nullable: true })
  birthDate: string;

  @Column({ type: 'float', nullable: true })
  height: number;

  @Column({ type: 'float', nullable: true })
  weight: number;

  @Column({ nullable: true, select: false })
  hashedRefreshToken: string;

  @Column({ nullable: true, select: false })
  resetPasswordToken: string;

  @Column({ nullable: true, select: false })
  resetPasswordExpires: Date;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @OneToMany(() => ClientMembership, (membership) => membership.client)
  memberships: ClientMembership[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;
}
