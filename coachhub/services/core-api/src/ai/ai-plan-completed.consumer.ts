import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlanSuggestionStatus } from '../common';
import {
	AiPlanCompletedPayload,
	EventEnvelope,
	EVENTS_EXCHANGE,
	EventType,
} from '../messaging/events';
import { AiPlanSuggestion } from './entities/ai-plan-suggestion.entity';
import { PlanSuggestionWarning } from './types/plan-suggestion.types';

/** Ceiling on stored warnings. ai-service caps its own list; this is the backstop. */
const MAX_WARNINGS = 100;

@Injectable()
export class AiPlanCompletedConsumer {
	private readonly logger = new Logger(AiPlanCompletedConsumer.name);

	constructor(
		@InjectRepository(AiPlanSuggestion)
		private readonly suggestionRepository: Repository<AiPlanSuggestion>,
	) {}

	@RabbitSubscribe({
		exchange: EVENTS_EXCHANGE,
		routingKey: EventType.AI_PLAN_COMPLETED,
		queue: 'core-api.ai-plan-completed.q',
		queueOptions: { durable: true },
	})
	async handlePlanCompleted(envelope: EventEnvelope<AiPlanCompletedPayload>) {
		const { payload } = envelope;
		this.logger.debug(
			`${EventType.AI_PLAN_COMPLETED} received (suggestionId=${payload.suggestionId}, status=${payload.status}, correlationId=${envelope.correlationId})`,
		);

		const suggestion = await this.suggestionRepository.findOne({
			where: { requestId: payload.requestId },
			select: { id: true, tenantId: true, status: true },
		});

		if (!suggestion) {
			// Nothing to retry into existence — requeuing would loop forever.
			this.logger.warn(
				`no suggestion for requestId=${payload.requestId}; dropping the completion`,
			);
			return;
		}

		if (suggestion.tenantId !== envelope.tenantId) {
			this.logger.error(
				`tenant mismatch for suggestion ${suggestion.id}: row belongs to ${suggestion.tenantId}, event carried ${envelope.tenantId}`,
			);
			return;
		}

		if (suggestion.status !== PlanSuggestionStatus.PENDING) {
			this.logger.warn(
				`suggestion ${suggestion.id} is already ${suggestion.status}; ignoring this completion`,
			);
			return;
		}

		const update = this.resolveOutcome(payload);

		// Conditional on the status, not just the id: two deliveries arriving
		// together would both pass the check above, and only one may win.
		const result = await this.suggestionRepository.update(
			{ id: suggestion.id, status: PlanSuggestionStatus.PENDING },
			update,
		);

		if (!result.affected) {
			this.logger.warn(
				`suggestion ${suggestion.id} was resolved by another delivery; nothing written`,
			);
			return;
		}

		this.logger.log(
			`suggestion ${suggestion.id} is now ${update.status} (${update.warnings?.length ?? 0} warnings, correlationId=${envelope.correlationId})`,
		);
	}

	private resolveOutcome(
		payload: AiPlanCompletedPayload,
	): Partial<AiPlanSuggestion> {
		const modelMeta = payload.modelMeta ?? null;

		if (payload.status === 'failed') {
			return {
				status: PlanSuggestionStatus.FAILED,
				error: payload.error ?? 'Generation failed without an explanation.',
				modelMeta,
			};
		}

		// A success with nothing in it would violate
		// ck_ai_plan_suggestions_ready_has_plan on write, and the failed insert
		// would put the message back on the queue to fail again forever. Name it
		// instead.
		if (!payload.plan) {
			this.logger.error(
				`completion for requestId=${payload.requestId} claimed success but carried no plan`,
			);
			return {
				status: PlanSuggestionStatus.FAILED,
				error: 'The generator reported success but returned no plan.',
				modelMeta,
			};
		}

		const warnings = this.normalizeWarnings(payload.warnings);
		const blocked = warnings.some((warning) => warning.severity === 'error');

		return {
			status: blocked
				? PlanSuggestionStatus.INVALID
				: PlanSuggestionStatus.READY,
			plan: payload.plan,
			warnings,
			error: null,
			modelMeta,
		};
	}

	private normalizeWarnings(
		warnings: PlanSuggestionWarning[] | undefined,
	): PlanSuggestionWarning[] {
		if (!Array.isArray(warnings)) {
			return [];
		}
		return warnings.slice(0, MAX_WARNINGS).map((warning) => ({
			code: warning?.code ?? 'unknown',
			severity: warning?.severity === 'warning' ? 'warning' : 'error',
			path: warning?.path ?? '',
			message: warning?.message ?? '',
		}));
	}
}
