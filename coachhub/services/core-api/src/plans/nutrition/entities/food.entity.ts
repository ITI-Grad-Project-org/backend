import {
	Check,
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Coach } from '../../../coaches/entities/coach.entity';
import {
	DietaryPreference,
	numericTransformer,
	ServingUnit,
} from '../../../common';
import { Tenant } from '../../../tenant/entities/tenant.entity';

@Entity('foods')
@Index('ux_foods_tenant_name_brand', ['tenantId', 'name', 'brand'], {
	unique: true,
})
@Index('ix_foods_tenant_active', ['tenantId', 'isActive'])
@Index('ix_foods_tenant_name', ['tenantId', 'name'])
@Check('ck_foods_serving_size', `"serving_size" > 0`)
@Check(
	'ck_foods_non_negative_nutrients',
	`"calories" >= 0 AND "protein_g" >= 0 AND "carbs_g" >= 0 AND "fat_g" >= 0 AND ("fiber_g" IS NULL OR "fiber_g" >= 0)`,
)
export class Food {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@ManyToOne(() => Coach, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'created_by' })
	createdBy: Coach;

	@Column({ length: 150 })
	name: string;

	@Column({ length: 100, nullable: true })
	brand: string | null;

	@Column({
		name: 'serving_size',
		type: 'numeric',
		precision: 8,
		scale: 2,
		transformer: numericTransformer,
	})
	servingSize: number;

	@Column({
		name: 'serving_unit',
		type: 'enum',
		enum: ServingUnit,
		enumName: 'serving_unit',
	})
	servingUnit: ServingUnit;

	@Column({
		type: 'numeric',
		precision: 8,
		scale: 2,
		transformer: numericTransformer,
	})
	calories: number;

	@Column({
		name: 'protein_g',
		type: 'numeric',
		precision: 7,
		scale: 2,
		transformer: numericTransformer,
	})
	proteinG: number;

	@Column({
		name: 'carbs_g',
		type: 'numeric',
		precision: 7,
		scale: 2,
		transformer: numericTransformer,
	})
	carbsG: number;

	@Column({
		name: 'fat_g',
		type: 'numeric',
		precision: 7,
		scale: 2,
		transformer: numericTransformer,
	})
	fatG: number;

	@Column({
		name: 'fiber_g',
		type: 'numeric',
		precision: 7,
		scale: 2,
		nullable: true,
		transformer: numericTransformer,
	})
	fiberG: number | null;

	@Column({
		name: 'dietary_tags',
		type: 'enum',
		enum: DietaryPreference,
		enumName: 'dietary_preference',
		array: true,
		default: '{}',
	})
	dietaryTags: DietaryPreference[];

	@Column({ type: 'text', array: true, default: '{}' })
	allergens: string[];

	@Column({ name: 'is_active', default: true })
	isActive: boolean;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
