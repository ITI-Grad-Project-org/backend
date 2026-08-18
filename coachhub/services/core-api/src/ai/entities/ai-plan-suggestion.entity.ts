import {
	Check,
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
} from 'typeorm';
import { ClientMembership } from '../../clients/entities/client-membership.entity';
import { Coach } from '../../coaches/entities/coach.entity';
import { PlanSuggestionKind, PlanSuggestionStatus } from '../../common';
import { NutritionPlan } from '../../plans/nutrition/entities/nutrition-plan.entity';
import { Program } from '../../plans/training/entities/program.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import {
	PlanInputSnapshot,
	PlanModelMeta,
	PlanSuggestionWarning,
	SuggestedPlan,
} from '../types/plan-suggestion.types';

/**
 * A plan the AI proposed for one client, and what the coach did about it.
 *
 * <h2>Why this is a table and not a WebSocket frame</h2>
 *
 * Generation takes far longer than a request, and the coach reads the result,
 * thinks, and may come back to it tomorrow. Without a row the proposal exists
 * only in the socket frame that delivered it, so a refresh loses it and a
 * dropped connection loses it silently.
 *
 * <h2>Why it lives in core-api and not ai-service</h2>
 *
 * Accepting has to build the program tree in Postgres transactionally, and the
 * two services share no synchronous path — only RabbitMQ. So the plan travels on
 * `ai.plan.completed` and is stored here. ai-service keeps its own `AiDocument`
 * record of what it generated; that answers a different question.
 */
@Entity('ai_plan_suggestions')
@Index('ux_ai_plan_suggestions_request', ['requestId'], { unique: true })
@Index('ix_ai_plan_suggestions_membership', [
	'tenantId',
	'membershipId',
	'createdAt',
])
@Index('ix_ai_plan_suggestions_status', ['tenantId', 'status'])
// A training suggestion can only ever produce a program and a nutrition one only
// a nutrition plan, and nothing but an accepted suggestion produces either. This
// is the constraint that makes `created_program_id` trustworthy as the
// idempotency key: if it is set, this suggestion was accepted, once.
@Check(
	'ck_ai_plan_suggestions_accepted_result',
	`("status" <> 'accepted' AND "created_program_id" IS NULL AND "created_plan_id" IS NULL)
	 OR ("status" = 'accepted' AND "kind" = 'training' AND "created_program_id" IS NOT NULL AND "created_plan_id" IS NULL)
	 OR ("status" = 'accepted' AND "kind" = 'nutrition' AND "created_plan_id" IS NOT NULL AND "created_program_id" IS NULL)`,
)
// A suggestion is only offerable if there is something to offer. Catches a
// consumer that marks a row ready without writing the plan.
@Check(
	'ck_ai_plan_suggestions_ready_has_plan',
	`"status" NOT IN ('ready', 'accepted') OR "plan" IS NOT NULL`,
)
// `decided_at` records the coach's decision, so it tracks exactly those two
// states — not `invalid` or `failed`, which the system reaches on its own.
@Check(
	'ck_ai_plan_suggestions_decided_at',
	`("status" IN ('accepted', 'declined')) = ("decided_at" IS NOT NULL)`,
)
export class AiPlanSuggestion {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ name: 'membership_id', type: 'uuid' })
	membershipId: string;

	/**
	 * RESTRICT rather than CASCADE: a suggestion is part of the record of what a
	 * coach was advised to do, and it should not disappear because a membership
	 * was tidied up.
	 */
	@ManyToOne(() => ClientMembership, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'membership_id' })
	membership: ClientMembership;

	@Column({ name: 'requested_by', type: 'uuid' })
	requestedById: string;

	@ManyToOne(() => Coach, { nullable: false })
	@JoinColumn({ name: 'requested_by' })
	requestedBy: Coach;

	/**
	 * Correlates with `ai.plan.requested` / `ai.plan.completed`. Unique, so a
	 * redelivered completion updates one row instead of creating a second.
	 */
	@Column({ name: 'request_id', type: 'uuid' })
	requestId: string;

	@Column({
		type: 'enum',
		enum: PlanSuggestionKind,
		enumName: 'ai_plan_suggestion_kind',
	})
	kind: PlanSuggestionKind;

	@Column({
		type: 'enum',
		enum: PlanSuggestionStatus,
		enumName: 'ai_plan_suggestion_status',
		default: PlanSuggestionStatus.PENDING,
	})
	status: PlanSuggestionStatus;

	/**
	 * The client's intake and measurements as they stood at generation.
	 *
	 * A client's weight and goals change; a suggestion may be accepted days after
	 * it was made. This is what the model actually reasoned about, and it is the
	 * honest answer when a coach asks why it proposed what it did.
	 */
	@Column({ name: 'input_snapshot', type: 'jsonb' })
	inputSnapshot: PlanInputSnapshot;

	/** Null until the model answers; never null once the status is `ready`. */
	@Column({ type: 'jsonb', nullable: true })
	plan: SuggestedPlan | null;

	/**
	 * Persisted rather than recomputed on read. What the coach saw when they
	 * accepted is a fact about that decision — recomputing later would show them
	 * today's answer to yesterday's question.
	 */
	@Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
	warnings: PlanSuggestionWarning[];

	/** Set when the status is `failed`: why no usable answer came back. */
	@Column({ type: 'text', nullable: true })
	error: string | null;

	@Column({ name: 'model_meta', type: 'jsonb', nullable: true })
	modelMeta: PlanModelMeta | null;

	@Column({ name: 'created_program_id', type: 'uuid', nullable: true })
	createdProgramId: string | null;

	@ManyToOne(() => Program, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'created_program_id' })
	createdProgram: Program | null;

	@Column({ name: 'created_plan_id', type: 'uuid', nullable: true })
	createdPlanId: string | null;

	@ManyToOne(() => NutritionPlan, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'created_plan_id' })
	createdPlan: NutritionPlan | null;

	/** Why the coach said no. The natural seed for a regenerate prompt. */
	@Column({ name: 'decline_reason', type: 'text', nullable: true })
	declineReason: string | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	/** When the coach accepted or declined; null while the system still owns it. */
	@Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
	decidedAt: Date | null;
}
