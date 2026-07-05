import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Coach } from '../../coaches/entities/coach.entity';

@Entity('tenants')
export class Tenant {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@ManyToOne(() => Coach, (coach) => coach.tenants, { nullable: false })
	@JoinColumn({ name: 'owner_coach_id' })
	ownerCoach: Coach;

	/** Business/brand name shown to clients. */
	@Column({ length: 150 })
	name: string;

	@Column({ unique: true })
	slug: string;

	@Column({ name: 'logo_url', type: 'text', nullable: true })
	logoUrl: string | null;

	@Column({ length: 64, default: 'Africa/Cairo' })
	timezone: string;

	@Column({ type: 'char', length: 3, default: 'EGP' })
	currency: string;

	@Column({ type: 'jsonb', default: () => `'{}'` })
	settings: Record<string, unknown>;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
