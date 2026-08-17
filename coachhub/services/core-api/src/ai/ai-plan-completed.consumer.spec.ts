import { Repository } from 'typeorm';
import { PlanSuggestionKind, PlanSuggestionStatus } from '../common';
import {
	AiPlanCompletedPayload,
	EventEnvelope,
	EventType,
} from '../messaging/events';
import { AiPlanCompletedConsumer } from './ai-plan-completed.consumer';
import { AiPlanSuggestion } from './entities/ai-plan-suggestion.entity';
import { PlanSuggestionWarning } from './types/plan-suggestion.types';

const TENANT = 'tenant-1';
const REQUEST = 'request-1';
const SUGGESTION = 'suggestion-1';

const PLAN = { name: 'Dumbbell Fat Loss', week: { days: [] } };

function envelope(
	overrides: Partial<AiPlanCompletedPayload> = {},
	tenantId = TENANT,
): EventEnvelope<AiPlanCompletedPayload> {
	return {
		tenantId,
		correlationId: REQUEST,
		messageType: EventType.AI_PLAN_COMPLETED,
		timestamp: '2026-08-16T10:00:00.000Z',
		schemaVersion: '1.0.0',
		payload: {
			requestId: REQUEST,
			suggestionId: SUGGESTION,
			membershipId: 'membership-1',
			coachId: 'coach-1',
			kind: PlanSuggestionKind.TRAINING,
			status: 'succeeded',
			plan: PLAN,
			warnings: [],
			error: null,
			modelMeta: {
				model: 'gemini-2.5-flash',
				finishReason: 'STOP',
				promptTokens: 1200,
				outputTokens: 3400,
				totalTokens: 5400,
				latencyMs: 41_000,
			},
			...overrides,
		},
	};
}

function warning(
	severity: PlanSuggestionWarning['severity'],
): PlanSuggestionWarning {
	return {
		code: severity === 'error' ? 'unknown_exercise' : 'days_per_week_mismatch',
		severity,
		path: 'week.days[0]',
		message: 'something',
	};
}

describe('AiPlanCompletedConsumer', () => {
	let repository: { findOne: jest.Mock; update: jest.Mock };
	let consumer: AiPlanCompletedConsumer;

	beforeEach(() => {
		repository = {
			findOne: jest.fn().mockResolvedValue({
				id: SUGGESTION,
				tenantId: TENANT,
				status: PlanSuggestionStatus.PENDING,
			}),
			update: jest.fn().mockResolvedValue({ affected: 1 }),
		};
		consumer = new AiPlanCompletedConsumer(
			repository as unknown as Repository<AiPlanSuggestion>,
		);
	});

	function written() {
		return repository.update.mock.calls[0][1] as Partial<AiPlanSuggestion>;
	}

	it('marks a clean plan ready and stores it', async () => {
		await consumer.handlePlanCompleted(envelope());

		expect(written()).toMatchObject({
			status: PlanSuggestionStatus.READY,
			plan: PLAN,
			warnings: [],
			error: null,
		});
		expect(written().modelMeta).toMatchObject({ totalTokens: 5400 });
	});

	it('only writes to a row that is still pending', async () => {
		await consumer.handlePlanCompleted(envelope());

		expect(repository.update).toHaveBeenCalledWith(
			{ id: SUGGESTION, status: PlanSuggestionStatus.PENDING },
			expect.anything(),
		);
	});

	it('marks a plan with a blocking warning invalid, but keeps the plan', async () => {
		await consumer.handlePlanCompleted(
			envelope({ warnings: [warning('warning'), warning('error')] }),
		);

		expect(written()).toMatchObject({
			status: PlanSuggestionStatus.INVALID,
			plan: PLAN,
		});
		expect(written().warnings).toHaveLength(2);
	});

	it('leaves a plan ready when every warning is advisory', async () => {
		await consumer.handlePlanCompleted(
			envelope({ warnings: [warning('warning')] }),
		);

		expect(written().status).toBe(PlanSuggestionStatus.READY);
	});

	it('treats an unrecognised severity as blocking rather than guessing', async () => {
		await consumer.handlePlanCompleted(
			envelope({
				warnings: [
					{
						code: 'x',
						severity: 'catastrophe' as never,
						path: '',
						message: '',
					},
				],
			}),
		);

		expect(written().status).toBe(PlanSuggestionStatus.INVALID);
		expect(written().warnings?.[0].severity).toBe('error');
	});

	it('records why a generation failed', async () => {
		await consumer.handlePlanCompleted(
			envelope({
				status: 'failed',
				plan: null,
				error: 'Gemini blocked the prompt (blockReason=SAFETY)',
			}),
		);

		expect(written()).toMatchObject({
			status: PlanSuggestionStatus.FAILED,
			error: 'Gemini blocked the prompt (blockReason=SAFETY)',
		});
		expect(written().plan).toBeUndefined();
	});

	it('substitutes a message when a failure arrives without one', async () => {
		await consumer.handlePlanCompleted(
			envelope({ status: 'failed', plan: null, error: null }),
		);

		expect(written().error).toBe('Generation failed without an explanation.');
	});

	// Writing READY with a null plan would violate ck_ai_plan_suggestions_ready_has_plan,
	// and the rejected insert would put the message back on the queue to fail again.
	it('does not try to write a success that carries no plan', async () => {
		await consumer.handlePlanCompleted(envelope({ plan: null }));

		expect(written()).toMatchObject({
			status: PlanSuggestionStatus.FAILED,
			error: 'The generator reported success but returned no plan.',
		});
	});

	it('ignores a completion for a suggestion that no longer exists', async () => {
		repository.findOne.mockResolvedValue(null);

		await consumer.handlePlanCompleted(envelope());

		expect(repository.update).not.toHaveBeenCalled();
	});

	it('refuses to write across tenants', async () => {
		await consumer.handlePlanCompleted(envelope({}, 'a-different-tenant'));

		expect(repository.update).not.toHaveBeenCalled();
	});

	it.each([
		PlanSuggestionStatus.READY,
		PlanSuggestionStatus.FAILED,
		PlanSuggestionStatus.ACCEPTED,
		PlanSuggestionStatus.DECLINED,
	])('leaves an already-%s suggestion alone', async (status) => {
		repository.findOne.mockResolvedValue({
			id: SUGGESTION,
			tenantId: TENANT,
			status,
		});

		await consumer.handlePlanCompleted(envelope());

		expect(repository.update).not.toHaveBeenCalled();
	});

	it('survives losing the race to a simultaneous delivery', async () => {
		repository.update.mockResolvedValue({ affected: 0 });

		await expect(
			consumer.handlePlanCompleted(envelope()),
		).resolves.toBeUndefined();
	});

	it('caps a runaway warning list', async () => {
		await consumer.handlePlanCompleted(
			envelope({
				warnings: Array.from({ length: 250 }, () => warning('warning')),
			}),
		);

		expect(written().warnings).toHaveLength(100);
	});
});
