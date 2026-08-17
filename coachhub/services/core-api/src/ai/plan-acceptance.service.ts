import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { PlanSuggestionKind, PlanSuggestionStatus } from '../common';
import { getDateOnlyInTimeZone } from '../common/utils/date-only.utils';
import { AcceptPlanSuggestionDto } from './dto/accept-plan-suggestion.dto';
import { AiPlanSuggestion } from './entities/ai-plan-suggestion.entity';
import { buildNutritionPlanFromPlan } from './helpers/nutrition-plan.persistence';
import { StalePlanReferencesError } from './helpers/stale-plan-references.error';
import { buildProgramFromPlan } from './helpers/training-program.persistence';
import { PlanSuggestionWarning } from './types/plan-suggestion.types';

export interface AcceptedPlan {
	suggestionId: string;
	kind: PlanSuggestionKind;
	status: PlanSuggestionStatus;
	programId: string | null;
	planId: string | null;
	name: string;
	startDate: string;
	endDate: string;
	durationWeeks: number;
	decidedAt: Date;
}

@Injectable()
export class PlanAcceptanceService {
	private readonly logger = new Logger(PlanAcceptanceService.name);

	constructor(private readonly dataSource: DataSource) {}

	/**
	 * Builds the plan and marks the suggestion accepted, in one transaction.
	 *
	 * Both halves or neither. A program written without the suggestion flipping to
	 * `accepted` would be a program the coach can accept again, and
	 * `ck_ai_plan_suggestions_accepted_result` is only worth having if the id it
	 * guards was written under the same commit that set the status.
	 */
	async accept(
		suggestion: AiPlanSuggestion,
		membership: ClientMembership,
		coachId: string,
		dto: AcceptPlanSuggestionDto,
	): Promise<AcceptedPlan> {
		const plan = suggestion.plan;
		if (!plan) {
			// ck_ai_plan_suggestions_ready_has_plan should make this impossible.
			throw new ConflictException('This suggestion has no plan to accept');
		}

		const snapshot = suggestion.inputSnapshot;
		const durationWeeks = snapshot?.constraints?.durationWeeks ?? 4;
		const startDate = dto.startDate ?? this.today(membership.client);

		try {
			return await this.dataSource.transaction(async (manager) => {
				const built = await this.build(manager, {
					suggestion,
					membership,
					coachId,
					plan,
					durationWeeks,
					startDate,
					nameOverride: dto.name?.trim() || null,
				});

				const decidedAt = new Date();
				// Conditional on `ready`: two accepts racing would both have passed the
				// status check outside the transaction, and only one may write a result.
				const result = await manager.getRepository(AiPlanSuggestion).update(
					{ id: suggestion.id, status: PlanSuggestionStatus.READY },
					{
						status: PlanSuggestionStatus.ACCEPTED,
						decidedAt,
						createdProgramId: built.programId,
						createdPlanId: built.planId,
					},
				);

				if (!result.affected) {
					// Rolls the whole thing back, program included.
					throw new ConflictException(
						'This suggestion was decided by another request',
					);
				}

				this.logger.log(
					`suggestion ${suggestion.id} accepted → ${suggestion.kind} ${built.programId ?? built.planId} (${durationWeeks} weeks from ${startDate})`,
				);

				return {
					suggestionId: suggestion.id,
					kind: suggestion.kind,
					status: PlanSuggestionStatus.ACCEPTED,
					programId: built.programId,
					planId: built.planId,
					name: built.name,
					startDate,
					endDate: built.endDate,
					durationWeeks,
					decidedAt,
				};
			});
		} catch (error) {
			if (error instanceof StalePlanReferencesError) {
				// The transaction is gone, so this is written on its own — and it has to
				// be, or the coach is left with a button that keeps failing for a reason
				// nothing on screen explains.
				await this.markStale(suggestion, error);
				throw new ConflictException(
					`${error.message}. The suggestion has been marked invalid; generate a new one.`,
				);
			}
			throw error;
		}
	}

	private async build(
		manager: EntityManager,
		input: {
			suggestion: AiPlanSuggestion;
			membership: ClientMembership;
			coachId: string;
			plan: Record<string, unknown>;
			durationWeeks: number;
			startDate: string;
			nameOverride: string | null;
		},
	) {
		const shared = {
			tenantId: input.suggestion.tenantId,
			coachId: input.coachId,
			membershipId: input.membership.id,
			plan: input.plan,
			durationWeeks: input.durationWeeks,
			goal: input.suggestion.inputSnapshot?.constraints?.goal ?? null,
			startDate: input.startDate,
			nameOverride: input.nameOverride,
		};

		if (input.suggestion.kind === PlanSuggestionKind.TRAINING) {
			const program = await buildProgramFromPlan(manager, shared);
			return {
				programId: program.id,
				planId: null,
				name: program.name,
				endDate: program.endDate as string,
			};
		}

		const plan = await buildNutritionPlanFromPlan(manager, shared);
		return {
			programId: null,
			planId: plan.id,
			name: plan.name,
			endDate: plan.endDate as string,
		};
	}

	private async markStale(
		suggestion: AiPlanSuggestion,
		error: StalePlanReferencesError,
	) {
		const warnings: PlanSuggestionWarning[] = [
			...(suggestion.warnings ?? []),
			...error.ids.map((id) => ({
				code: `${error.kind}_no_longer_available`,
				severity: 'error' as const,
				path: '',
				message: `${error.kind === 'exercise' ? 'Exercise' : 'Meal'} ${id} is no longer in the library.`,
			})),
		];

		await this.dataSource
			.getRepository(AiPlanSuggestion)
			.update(
				{ id: suggestion.id, status: PlanSuggestionStatus.READY },
				{ status: PlanSuggestionStatus.INVALID, warnings },
			);
		this.logger.warn(
			`suggestion ${suggestion.id} marked invalid: ${error.message}`,
		);
	}

	/**
	 * A program starting "today" starts on the client's today, not the server's.
	 * A coach in Cairo scheduling for a client in Vancouver would otherwise hand
	 * them a plan whose first day is already over.
	 */
	private today(client: Client | null): string {
		return getDateOnlyInTimeZone(new Date(), client?.timezone || 'UTC');
	}
}
