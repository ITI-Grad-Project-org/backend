import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { LessThan, Repository } from 'typeorm';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import {
	MembershipStatus,
	PaginatedResponse,
	PlanSuggestionKind,
	PlanSuggestionStatus,
} from '../common';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { AiPlanRequestedPayload, EventType } from '../messaging/events';
import { AcceptPlanSuggestionDto } from './dto/accept-plan-suggestion.dto';
import { CreatePlanSuggestionDto } from './dto/create-plan-suggestion.dto';
import { DeclinePlanSuggestionDto } from './dto/decline-plan-suggestion.dto';
import { QueryPlanSuggestionsDto } from './dto/query-plan-suggestions.dto';
import { AiPlanSuggestion } from './entities/ai-plan-suggestion.entity';
import { PlanAcceptanceService } from './plan-acceptance.service';
import { PlanContextService } from './plan-context.service';
import {
	mapPlanSuggestionDetail,
	mapPlanSuggestionSummary,
	PlanSuggestionDetail,
	PlanSuggestionSummary,
} from './utils/plan-suggestion.utils';
import { EntitlementService } from '../billing/entitlement.service';

const PENDING_TIMEOUT_MS = 10 * 60 * 1_000;

const LIST_COLUMNS = {
	id: true,
	requestId: true,
	membershipId: true,
	kind: true,
	status: true,
	inputSnapshot: true,
	warnings: true,
	error: true,
	createdProgramId: true,
	createdPlanId: true,
	declineReason: true,
	createdAt: true,
	decidedAt: true,
} as const;

@Injectable()
export class PlanSuggestionsService {
	private readonly logger = new Logger(PlanSuggestionsService.name);

	constructor(
		@InjectRepository(AiPlanSuggestion)
		private readonly suggestionRepository: Repository<AiPlanSuggestion>,
		@InjectRepository(ClientMembership)
		private readonly membershipRepository: Repository<ClientMembership>,
		private readonly planContext: PlanContextService,
		private readonly acceptance: PlanAcceptanceService,
		private readonly events: EventPublisherService,
		private readonly entitlementService: EntitlementService,
	) {}

	/**
	 * Starts a generation. Returns as soon as the request is on the wire — the
	 * plan itself arrives later on `ai.plan.completed`.
	 */
	async request(
		tenantId: string | null,
		coachId: string,
		dto: CreatePlanSuggestionDto,
	) {
		const activeTenantId = this.assertActiveTenant(tenantId);
		await this.entitlementService.assertCanGenerateAiPlan(activeTenantId);
		const membership = await this.resolveActiveMembership(
			activeTenantId,
			dto.membershipId,
		);

		await this.expireStalePending(activeTenantId, membership.id, dto.kind);
		await this.assertNoPending(activeTenantId, membership.id, dto.kind);

		const { snapshot, candidates } = await this.planContext.build({
			tenantId: activeTenantId,
			membership,
			kind: dto.kind,
			requested: {
				durationWeeks: dto.durationWeeks,
				daysPerWeek: dto.daysPerWeek,
				goal: dto.goal,
			},
			coachNotes: dto.coachNotes?.trim() || null,
		});

		const requestId = randomUUID();
		const suggestion = await this.suggestionRepository.save(
			this.suggestionRepository.create({
				tenantId: activeTenantId,
				membershipId: membership.id,
				requestedById: coachId,
				requestId,
				kind: dto.kind,
				status: PlanSuggestionStatus.PENDING,
				inputSnapshot: snapshot,
			}),
		);

		const payload: AiPlanRequestedPayload = {
			requestId,
			suggestionId: suggestion.id,
			membershipId: membership.id,
			coachId,
			kind: dto.kind,
			context: snapshot,
			candidates,
		};

		try {
			// requestId doubles as the correlationId so one id follows the whole
			// exchange: this row, the outbound event, ai-service's logs, and the
			// completion that comes back.
			await this.events.publish(EventType.AI_PLAN_REQUESTED, payload, {
				tenantId: activeTenantId,
				correlationId: requestId,
			});
		} catch (error) {
			// The row is already written, so leaving it `pending` would promise an
			// answer that is never coming. Fail it now and say so.
			const message = error instanceof Error ? error.message : String(error);
			await this.suggestionRepository.update(suggestion.id, {
				status: PlanSuggestionStatus.FAILED,
				error: `Could not queue the generation request: ${message}`,
			});
			this.logger.error(
				`failed to publish ${EventType.AI_PLAN_REQUESTED} for suggestion ${suggestion.id}: ${message}`,
			);
			throw new ServiceUnavailableException(
				'Could not reach the plan generation service. Please try again.',
			);
		}

		return {
			suggestionId: suggestion.id,
			requestId,
			membershipId: membership.id,
			kind: suggestion.kind,
			status: suggestion.status,
			createdAt: suggestion.createdAt,
			constraints: snapshot.constraints,
			library: snapshot.library,
		};
	}

	async list(
		tenantId: string | null,
		query: QueryPlanSuggestionsDto,
	): Promise<PaginatedResponse<PlanSuggestionSummary>> {
		const activeTenantId = this.assertActiveTenant(tenantId);
		const page = query.page ?? 1;
		const limit = query.limit ?? 10;

		const [rows, total] = await this.suggestionRepository.findAndCount({
			where: {
				tenantId: activeTenantId,
				...(query.membershipId ? { membershipId: query.membershipId } : {}),
				...(query.kind ? { kind: query.kind } : {}),
				...(query.status ? { status: query.status } : {}),
			},
			select: LIST_COLUMNS,
			order: { createdAt: 'DESC', id: 'DESC' },
			skip: (page - 1) * limit,
			take: limit,
		});

		return {
			docs: rows.map(mapPlanSuggestionSummary),
			meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
		};
	}

	/** One suggestion in full: the plan, every warning, and what it was told. */
	async findOne(
		tenantId: string | null,
		suggestionId: string,
	): Promise<PlanSuggestionDetail> {
		const activeTenantId = this.assertActiveTenant(tenantId);
		const suggestion = await this.suggestionRepository.findOne({
			where: { id: suggestionId, tenantId: activeTenantId },
		});

		// Scoped by tenant in the same query, so another tenant's id is
		// indistinguishable from one that never existed. That is the point.
		if (!suggestion) {
			throw new NotFoundException('Plan suggestion not found');
		}

		return mapPlanSuggestionDetail(suggestion);
	}

	/**
	 * Turns a suggestion into a real program or nutrition plan.
	 *
	 * The membership is re-resolved rather than taken from the row: a suggestion
	 * can sit for days, and building a program for a client who has since been
	 * archived is not something the schema stops.
	 */
	async accept(
		tenantId: string | null,
		coachId: string,
		suggestionId: string,
		dto: AcceptPlanSuggestionDto,
	) {
		const activeTenantId = this.assertActiveTenant(tenantId);
		const suggestion = await this.loadOwned(activeTenantId, suggestionId);

		this.assertAcceptable(suggestion);
		const membership = await this.resolveActiveMembership(
			activeTenantId,
			suggestion.membershipId,
		);

		return this.acceptance.accept(suggestion, membership, coachId, dto);
	}

	/** Records the coach's no, and why — which is what a regeneration starts from. */
	async decline(
		tenantId: string | null,
		suggestionId: string,
		dto: DeclinePlanSuggestionDto,
	) {
		const activeTenantId = this.assertActiveTenant(tenantId);
		const suggestion = await this.loadOwned(activeTenantId, suggestionId);

		// Only a suggestion the coach has actually seen an answer for. `pending` has
		// nothing to judge yet and `failed` already ended; calling either of those a
		// decline would put the coach's name on a decision they did not make.
		if (
			suggestion.status !== PlanSuggestionStatus.READY &&
			suggestion.status !== PlanSuggestionStatus.INVALID
		) {
			throw new ConflictException(
				`Cannot decline a suggestion that is ${suggestion.status}`,
			);
		}

		const decidedAt = new Date();
		const result = await this.suggestionRepository.update(
			{ id: suggestion.id, status: suggestion.status },
			{
				status: PlanSuggestionStatus.DECLINED,
				decidedAt,
				declineReason: dto.reason?.trim() || null,
			},
		);

		if (!result.affected) {
			throw new ConflictException(
				'This suggestion was decided by another request',
			);
		}

		return {
			suggestionId: suggestion.id,
			status: PlanSuggestionStatus.DECLINED,
			declineReason: dto.reason?.trim() || null,
			decidedAt,
		};
	}

	private async loadOwned(tenantId: string, suggestionId: string) {
		const suggestion = await this.suggestionRepository.findOne({
			where: { id: suggestionId, tenantId },
		});

		if (!suggestion) {
			throw new NotFoundException('Plan suggestion not found');
		}

		return suggestion;
	}

	/**
	 * Only a `ready` suggestion may be built.
	 *
	 * `invalid` is the interesting one: it means something in the plan would be
	 * rejected on insert, so letting it through would trade a clear 409 for a
	 * constraint violation partway through writing a program tree. The status is
	 * the whole reason that check happened before the coach ever saw it.
	 */
	private assertAcceptable(suggestion: AiPlanSuggestion) {
		if (suggestion.status === PlanSuggestionStatus.READY) {
			return;
		}

		if (suggestion.status === PlanSuggestionStatus.ACCEPTED) {
			throw new ConflictException('This suggestion has already been accepted');
		}
		if (suggestion.status === PlanSuggestionStatus.INVALID) {
			const blocking = (suggestion.warnings ?? []).filter(
				(warning) => warning.severity === 'error',
			).length;
			throw new ConflictException(
				`This suggestion cannot be accepted: ${blocking} problem(s) would be rejected when saved`,
			);
		}
		throw new ConflictException(
			`Cannot accept a suggestion that is ${suggestion.status}`,
		);
	}

	private assertActiveTenant(tenantId: string | null): string {
		if (!tenantId) {
			throw new BadRequestException('No active tenant selected');
		}
		return tenantId;
	}

	private async resolveActiveMembership(
		tenantId: string,
		membershipId: string,
	) {
		const membership = await this.membershipRepository.findOne({
			where: {
				id: membershipId,
				tenant: { id: tenantId },
				status: MembershipStatus.ACTIVE,
			},
			relations: { client: true },
		});

		if (!membership) {
			throw new NotFoundException('Active client membership not found');
		}

		return membership;
	}

	/**
	 * One UPDATE rather than a read-then-write: two requests arriving together
	 * would otherwise both see the same stale row and both decide to replace it.
	 */
	private async expireStalePending(
		tenantId: string,
		membershipId: string,
		kind: PlanSuggestionKind,
	) {
		await this.suggestionRepository.update(
			{
				tenantId,
				membershipId,
				kind,
				status: PlanSuggestionStatus.PENDING,
				createdAt: LessThan(new Date(Date.now() - PENDING_TIMEOUT_MS)),
			},
			{
				status: PlanSuggestionStatus.FAILED,
				error: `No answer within ${PENDING_TIMEOUT_MS / 60_000} minutes.`,
			},
		);
	}

	private async assertNoPending(
		tenantId: string,
		membershipId: string,
		kind: PlanSuggestionKind,
	) {
		const pending = await this.suggestionRepository.findOne({
			where: {
				tenantId,
				membershipId,
				kind,
				status: PlanSuggestionStatus.PENDING,
			},
			select: { id: true },
		});

		if (pending) {
			throw new ConflictException(
				'A plan of this kind is already being generated for this client',
			);
		}
	}
}
