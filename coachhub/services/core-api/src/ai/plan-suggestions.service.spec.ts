import {
	BadRequestException,
	ConflictException,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import {
	MembershipStatus,
	PlanSuggestionKind,
	PlanSuggestionStatus,
} from '../common';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { EventType } from '../messaging/events';
import { CreatePlanSuggestionDto } from './dto/create-plan-suggestion.dto';
import { AiPlanSuggestion } from './entities/ai-plan-suggestion.entity';
import { PlanAcceptanceService } from './plan-acceptance.service';
import { PlanContextService } from './plan-context.service';
import { PlanSuggestionsService } from './plan-suggestions.service';
import { PlanGenerationContext } from './types/plan-suggestion.types';
import { EntitlementService } from '../billing/entitlement.service';

const TENANT = 'tenant-1';
const COACH = 'coach-1';
const MEMBERSHIP = 'membership-1';

const DTO: CreatePlanSuggestionDto = {
	membershipId: MEMBERSHIP,
	kind: PlanSuggestionKind.TRAINING,
};

const CONTEXT: PlanGenerationContext = {
	snapshot: {
		client: { ageYears: 30, gender: null, heightCm: 180, weightKg: 80 },
		intake: null,
		measurements: [],
		history: { checkins: [], sessions: [] },
		constraints: { durationWeeks: 4, daysPerWeek: 3, goal: null },
		library: {
			counts: { exercises: 2 },
			equipment: [],
			excludedAllergens: [],
			truncated: false,
		},
		coachNotes: null,
	},
	candidates: {
		exercises: [
			{
				id: 'exercise-1',
				name: 'Push-up',
				category: 'strength',
				primaryMuscle: 'chest',
				secondaryMuscles: [],
				equipment: [],
			},
		],
		meals: [],
		foods: [],
	} as unknown as PlanGenerationContext['candidates'],
};

/** A row as it looks after ai.plan.completed has landed on it. */
function storedSuggestion(
	overrides: Partial<AiPlanSuggestion> = {},
): AiPlanSuggestion {
	return {
		id: 'suggestion-1',
		requestId: 'request-1',
		tenantId: TENANT,
		membershipId: MEMBERSHIP,
		kind: PlanSuggestionKind.TRAINING,
		status: PlanSuggestionStatus.INVALID,
		inputSnapshot: CONTEXT.snapshot,
		plan: { name: 'A plan' },
		warnings: [
			{ code: 'unknown_exercise', severity: 'error', path: 'a', message: 'm' },
			{
				code: 'days_per_week_mismatch',
				severity: 'warning',
				path: 'b',
				message: 'm',
			},
		],
		error: null,
		modelMeta: {
			model: 'gemini-2.5-flash',
			finishReason: 'STOP',
			promptTokens: 1200,
			outputTokens: 3400,
			totalTokens: 5400,
			latencyMs: 41000,
		},
		createdProgramId: null,
		createdPlanId: null,
		declineReason: null,
		createdAt: new Date('2026-08-16T10:00:00.000Z'),
		decidedAt: null,
		...overrides,
	} as unknown as AiPlanSuggestion;
}

describe('PlanSuggestionsService', () => {
	let suggestionRepository: {
		create: jest.Mock;
		save: jest.Mock;
		update: jest.Mock;
		findOne: jest.Mock;
		findAndCount: jest.Mock;
	};
	let membershipRepository: { findOne: jest.Mock };
	let planContext: { build: jest.Mock };
	let acceptance: { accept: jest.Mock };
	let events: { publish: jest.Mock };
	let entitlements: { assertCanGenerateAiPlan: jest.Mock };
	let service: PlanSuggestionsService;

	beforeEach(() => {
		suggestionRepository = {
			create: jest.fn((row) => row),
			save: jest.fn((row) =>
				Promise.resolve({
					...row,
					id: 'suggestion-1',
					createdAt: new Date('2026-08-16T10:00:00.000Z'),
				}),
			),
			update: jest.fn().mockResolvedValue({ affected: 0 }),
			findOne: jest.fn().mockResolvedValue(null),
			findAndCount: jest.fn().mockResolvedValue([[], 0]),
		};
		membershipRepository = {
			findOne: jest.fn().mockResolvedValue({
				id: MEMBERSHIP,
				client: { id: 'client-1' },
			} as unknown as ClientMembership),
		};
		planContext = { build: jest.fn().mockResolvedValue(CONTEXT) };
		acceptance = {
			accept: jest.fn().mockResolvedValue({ programId: 'program-1' }),
		};
		events = { publish: jest.fn().mockResolvedValue('correlation-1') };
		entitlements = {
			assertCanGenerateAiPlan: jest.fn().mockResolvedValue(undefined),
		};

		service = new PlanSuggestionsService(
			suggestionRepository as unknown as Repository<AiPlanSuggestion>,
			membershipRepository as unknown as Repository<ClientMembership>,
			planContext as unknown as PlanContextService,
			acceptance as unknown as PlanAcceptanceService,
			events as unknown as EventPublisherService,
			entitlements as unknown as EntitlementService,
		);
	});

	it('rejects a caller with no active tenant before touching the database', async () => {
		await expect(service.request(null, COACH, DTO)).rejects.toBeInstanceOf(
			BadRequestException,
		);
		expect(membershipRepository.findOne).not.toHaveBeenCalled();
	});

	it('checks AI access before starting a new generation', async () => {
		await service.request(TENANT, COACH, DTO);

		expect(entitlements.assertCanGenerateAiPlan).toHaveBeenCalledWith(TENANT);
	});

	it('looks the membership up inside the caller’s own tenant', async () => {
		await service.request(TENANT, COACH, DTO);

		expect(membershipRepository.findOne).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					id: MEMBERSHIP,
					tenant: { id: TENANT },
					status: MembershipStatus.ACTIVE,
				},
			}),
		);
	});

	it('404s on a membership that is not an active one of this tenant', async () => {
		membershipRepository.findOne.mockResolvedValue(null);

		await expect(service.request(TENANT, COACH, DTO)).rejects.toBeInstanceOf(
			NotFoundException,
		);
		expect(events.publish).not.toHaveBeenCalled();
	});

	it('refuses a second generation while one is still pending', async () => {
		suggestionRepository.findOne.mockResolvedValue({ id: 'suggestion-0' });

		await expect(service.request(TENANT, COACH, DTO)).rejects.toBeInstanceOf(
			ConflictException,
		);
		expect(events.publish).not.toHaveBeenCalled();
	});

	it('fails an abandoned pending row rather than locking the client out', async () => {
		await service.request(TENANT, COACH, DTO);

		expect(suggestionRepository.update).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: TENANT,
				membershipId: MEMBERSHIP,
				kind: PlanSuggestionKind.TRAINING,
				status: PlanSuggestionStatus.PENDING,
				createdAt: expect.anything(),
			}),
			expect.objectContaining({ status: PlanSuggestionStatus.FAILED }),
		);
	});

	it('stores the snapshot the model was given, pending an answer', async () => {
		await service.request(TENANT, COACH, DTO);

		expect(suggestionRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: TENANT,
				membershipId: MEMBERSHIP,
				requestedById: COACH,
				kind: PlanSuggestionKind.TRAINING,
				status: PlanSuggestionStatus.PENDING,
				inputSnapshot: CONTEXT.snapshot,
			}),
		);
	});

	it('publishes the candidates alongside the context, correlated by requestId', async () => {
		const result = await service.request(TENANT, COACH, DTO);

		expect(events.publish).toHaveBeenCalledWith(
			EventType.AI_PLAN_REQUESTED,
			expect.objectContaining({
				requestId: result.requestId,
				suggestionId: 'suggestion-1',
				membershipId: MEMBERSHIP,
				coachId: COACH,
				kind: PlanSuggestionKind.TRAINING,
				context: CONTEXT.snapshot,
				candidates: CONTEXT.candidates,
			}),
			{ tenantId: TENANT, correlationId: result.requestId },
		);
	});

	it('hands back the ids the coach needs to follow the request', async () => {
		const result = await service.request(TENANT, COACH, DTO);

		expect(result).toMatchObject({
			suggestionId: 'suggestion-1',
			membershipId: MEMBERSHIP,
			kind: PlanSuggestionKind.TRAINING,
			status: PlanSuggestionStatus.PENDING,
			library: CONTEXT.snapshot.library,
			constraints: CONTEXT.snapshot.constraints,
		});
		expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('does not leave a row promising an answer when the queue is unreachable', async () => {
		events.publish.mockRejectedValue(new Error('broker down'));

		await expect(service.request(TENANT, COACH, DTO)).rejects.toBeInstanceOf(
			ServiceUnavailableException,
		);
		expect(suggestionRepository.update).toHaveBeenLastCalledWith(
			'suggestion-1',
			expect.objectContaining({
				status: PlanSuggestionStatus.FAILED,
				error: expect.stringContaining('broker down'),
			}),
		);
	});

	describe('list', () => {
		beforeEach(() => {
			suggestionRepository.findAndCount.mockResolvedValue([
				[storedSuggestion()],
				1,
			]);
		});

		it('rejects a caller with no active tenant', async () => {
			await expect(service.list(null, {})).rejects.toBeInstanceOf(
				BadRequestException,
			);
		});

		it('scopes every list to the caller’s tenant', async () => {
			await service.list(TENANT, {});

			expect(suggestionRepository.findAndCount).toHaveBeenCalledWith(
				expect.objectContaining({ where: { tenantId: TENANT } }),
			);
		});

		it('applies the membership, kind and status filters when given', async () => {
			await service.list(TENANT, {
				membershipId: MEMBERSHIP,
				kind: PlanSuggestionKind.NUTRITION,
				status: PlanSuggestionStatus.READY,
			});

			expect(suggestionRepository.findAndCount).toHaveBeenCalledWith(
				expect.objectContaining({
					where: {
						tenantId: TENANT,
						membershipId: MEMBERSHIP,
						kind: PlanSuggestionKind.NUTRITION,
						status: PlanSuggestionStatus.READY,
					},
				}),
			);
		});

		it('never selects the plan — that is what the detail endpoint is for', async () => {
			await service.list(TENANT, {});

			const { select } = suggestionRepository.findAndCount.mock.calls[0][0];
			expect(select).not.toHaveProperty('plan');
			expect(select).toMatchObject({ inputSnapshot: true, warnings: true });
		});

		it('returns newest first, paginated', async () => {
			suggestionRepository.findAndCount.mockResolvedValue([
				[storedSuggestion()],
				25,
			]);

			const result = await service.list(TENANT, { page: 2, limit: 10 });

			expect(suggestionRepository.findAndCount).toHaveBeenCalledWith(
				expect.objectContaining({
					order: { createdAt: 'DESC', id: 'DESC' },
					skip: 10,
					take: 10,
				}),
			);
			expect(result.meta).toEqual({
				total: 25,
				page: 2,
				limit: 10,
				totalPages: 3,
			});
		});

		it('summarises a row without dumping its warnings', async () => {
			const result = await service.list(TENANT, {});

			expect(result.docs[0]).toMatchObject({
				id: 'suggestion-1',
				status: PlanSuggestionStatus.INVALID,
				warningCounts: { error: 1, warning: 1 },
				constraints: { durationWeeks: 4, daysPerWeek: 3, goal: null },
			});
			expect(result.docs[0]).not.toHaveProperty('warnings');
			expect(result.docs[0]).not.toHaveProperty('plan');
		});
	});

	describe('findOne', () => {
		it('returns the plan, the warnings and what the model was told', async () => {
			suggestionRepository.findOne.mockResolvedValue(storedSuggestion());

			const result = await service.findOne(TENANT, 'suggestion-1');

			expect(result.plan).toEqual({ name: 'A plan' });
			expect(result.warnings).toHaveLength(2);
			expect(result.input).toMatchObject({
				constraints: { durationWeeks: 4 },
			});
			expect(result.modelMeta).toMatchObject({ totalTokens: 5400 });
		});

		it('looks the suggestion up inside the caller’s tenant', async () => {
			suggestionRepository.findOne.mockResolvedValue(storedSuggestion());

			await service.findOne(TENANT, 'suggestion-1');

			expect(suggestionRepository.findOne).toHaveBeenCalledWith({
				where: { id: 'suggestion-1', tenantId: TENANT },
			});
		});

		it('404s for another tenant’s suggestion, exactly as for one that never existed', async () => {
			suggestionRepository.findOne.mockResolvedValue(null);

			await expect(
				service.findOne(TENANT, 'suggestion-1'),
			).rejects.toBeInstanceOf(NotFoundException);
		});

		it('rejects a caller with no active tenant', async () => {
			await expect(
				service.findOne(null, 'suggestion-1'),
			).rejects.toBeInstanceOf(BadRequestException);
		});
	});

	describe('accept', () => {
		beforeEach(() => {
			suggestionRepository.findOne.mockResolvedValue(
				storedSuggestion({ status: PlanSuggestionStatus.READY }),
			);
		});

		it('builds the plan for a ready suggestion', async () => {
			await service.accept(TENANT, COACH, 'suggestion-1', {});

			expect(acceptance.accept).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'suggestion-1' }),
				expect.objectContaining({ id: MEMBERSHIP }),
				COACH,
				{},
			);
		});

		it('re-checks the membership is still active before building', async () => {
			membershipRepository.findOne.mockResolvedValue(null);

			await expect(
				service.accept(TENANT, COACH, 'suggestion-1', {}),
			).rejects.toBeInstanceOf(NotFoundException);
			expect(acceptance.accept).not.toHaveBeenCalled();
		});

		it('refuses to accept the same suggestion twice', async () => {
			suggestionRepository.findOne.mockResolvedValue(
				storedSuggestion({ status: PlanSuggestionStatus.ACCEPTED }),
			);

			await expect(
				service.accept(TENANT, COACH, 'suggestion-1', {}),
			).rejects.toThrow('already been accepted');
			expect(acceptance.accept).not.toHaveBeenCalled();
		});

		// invalid means something in the plan would be rejected on insert, so this
		// trades a clear 409 for a constraint violation partway through a tree.
		it('refuses an invalid suggestion and says how many problems it has', async () => {
			suggestionRepository.findOne.mockResolvedValue(
				storedSuggestion({ status: PlanSuggestionStatus.INVALID }),
			);

			await expect(
				service.accept(TENANT, COACH, 'suggestion-1', {}),
			).rejects.toThrow('1 problem(s)');
		});

		it.each([
			PlanSuggestionStatus.PENDING,
			PlanSuggestionStatus.FAILED,
			PlanSuggestionStatus.DECLINED,
		])('refuses to accept a %s suggestion', async (status) => {
			suggestionRepository.findOne.mockResolvedValue(
				storedSuggestion({ status }),
			);

			await expect(
				service.accept(TENANT, COACH, 'suggestion-1', {}),
			).rejects.toBeInstanceOf(ConflictException);
			expect(acceptance.accept).not.toHaveBeenCalled();
		});

		it('404s on another tenant’s suggestion', async () => {
			suggestionRepository.findOne.mockResolvedValue(null);

			await expect(
				service.accept(TENANT, COACH, 'suggestion-1', {}),
			).rejects.toBeInstanceOf(NotFoundException);
		});
	});

	describe('decline', () => {
		beforeEach(() => {
			suggestionRepository.findOne.mockResolvedValue(
				storedSuggestion({ status: PlanSuggestionStatus.READY }),
			);
			suggestionRepository.update.mockResolvedValue({ affected: 1 });
		});

		it('records the decision and the reason', async () => {
			const result = await service.decline(TENANT, 'suggestion-1', {
				reason: '  Too much pressing volume.  ',
			});

			expect(suggestionRepository.update).toHaveBeenCalledWith(
				{ id: 'suggestion-1', status: PlanSuggestionStatus.READY },
				expect.objectContaining({
					status: PlanSuggestionStatus.DECLINED,
					declineReason: 'Too much pressing volume.',
					decidedAt: expect.any(Date),
				}),
			);
			expect(result.status).toBe(PlanSuggestionStatus.DECLINED);
		});

		it('allows declining an invalid suggestion — a bad plan is still an answer', async () => {
			suggestionRepository.findOne.mockResolvedValue(
				storedSuggestion({ status: PlanSuggestionStatus.INVALID }),
			);

			await expect(
				service.decline(TENANT, 'suggestion-1', {}),
			).resolves.toMatchObject({ status: PlanSuggestionStatus.DECLINED });
		});

		it('stores no reason rather than an empty one', async () => {
			await service.decline(TENANT, 'suggestion-1', { reason: '   ' });

			expect(suggestionRepository.update).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ declineReason: null }),
			);
		});

		it.each([
			PlanSuggestionStatus.PENDING,
			PlanSuggestionStatus.FAILED,
			PlanSuggestionStatus.ACCEPTED,
			PlanSuggestionStatus.DECLINED,
		])('refuses to decline a %s suggestion', async (status) => {
			suggestionRepository.findOne.mockResolvedValue(
				storedSuggestion({ status }),
			);

			await expect(
				service.decline(TENANT, 'suggestion-1', {}),
			).rejects.toBeInstanceOf(ConflictException);
			expect(suggestionRepository.update).not.toHaveBeenCalled();
		});

		it('loses gracefully to a simultaneous decision', async () => {
			suggestionRepository.update.mockResolvedValue({ affected: 0 });

			await expect(service.decline(TENANT, 'suggestion-1', {})).rejects.toThrow(
				'decided by another request',
			);
		});
	});
});
