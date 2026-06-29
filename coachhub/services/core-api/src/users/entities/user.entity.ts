import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

export interface CoachCertification {
  title: string;
  issuer?: string;
  issuedAt?: string;
  fileUrl?: string;
}

export interface CoachPortfolioItem {
  title: string;
  description?: string;
  mediaUrls?: string[];
  linkUrl?: string;
}

export interface CoachClientTransformation {
  title: string;
  description?: string;
  beforeImageUrl: string;
  afterImageUrl: string;
  mediaUrls?: string[];
}

export interface CoachLocation {
  city?: string;
  country?: string;
}

export interface CoachPriceRange {
  min?: number;
  max?: number;
  currency?: string;
}

// TODO(reviews): add a separate review model later and calculate coach rating
// from client review ratings instead of storing a manually editable field.
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column()
  phoneNumber: string;

  @Column({ nullable: true })
  whatsappNumber?: string;

  @Column({ type: 'jsonb', nullable: true })
  certifications?: CoachCertification[];

  @Column({ type: 'jsonb', nullable: true })
  specializations?: string[];

  @Column({ nullable: true })
  yearsOfExperience?: number;

  @Column({ type: 'text', nullable: true })
  professionalExperience?: string;

  @Column({ type: 'jsonb', nullable: true })
  portfolio?: CoachPortfolioItem[];

  @Column({ type: 'jsonb', nullable: true })
  clientTransformations?: CoachClientTransformation[];

  //Register
  @Column({ default: false })
  offlineCoachingAvailable: boolean;

  @Column({ type: 'jsonb', nullable: true })
  location?: CoachLocation;

  @Column({ type: 'text', nullable: true })
  biography?: string;

  @Column({ type: 'text', nullable: true })
  availabilityHours?: string;
  //Register
  @Column({ type: 'jsonb', nullable: true })
  priceRange?: CoachPriceRange;

  @Column({ default: null, select: false })
  hashedRefreshToken: string;

  @Column({ default: null, select: false })
  resetPasswordToken: string;

  @Column({ default: null, select: false })
  resetPasswordExpires: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @OneToOne(() => Tenant, (tenant) => tenant.user, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
