import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
	MembershipStatus,
	NutritionPlanStatus,
	NutritionPlanType,
} from '../../../common';
import { ClientNutritionScheduleService } from './client-nutrition-schedule.service';

describe('ClientNutritionScheduleService isolation', () => {
	const membership = {
		id: 'membership-id',
		tenant: { id: 'tenant-id', timezone: 'Africa/Cairo' },
	};
	let membershipRepository: { findOne: jest.Mock };
	let clientIntakeRepository: { findOne: jest.Mock };
	let nutritionPlanRepository: { find: jest.Mock; findOne: jest.Mock };
	let nutritionPlanDayRepository: { findOne: jest.Mock };
	let nutritionDayLogRepository: { find: jest.Mock };
	let foodLibraryService: { findFoods: jest.Mock };
	let service: ClientNutritionScheduleService;

	beforeEach(() => {
		membershipRepository = { findOne: jest.fn(async () => membership) };
		clientIntakeRepository = { findOne: jest.fn(async () => null) };
		nutritionPlanRepository = {
			find: jest.fn(async () => []),
			findOne: jest.fn(async () => null),
		};
		nutritionPlanDayRepository = { findOne: jest.fn() };
		nutritionDayLogRepository = { find: jest.fn(async () => []) };
		foodLibraryService = { findFoods: jest.fn(async () => []) };
		service = new ClientNutritionScheduleService(
			membershipRepository as never,
			clientIntakeRepository as never,
			nutritionPlanRepository as never,
			nutritionPlanDayRepository as never,
			nutritionDayLogRepository as never,
			foodLibraryService as never,
		);
	});

	it('resolves an active membership from both JWT identities', async () => {
		await service.listPublishedPlans('client-id', 'tenant-id');

		expect(membershipRepository.findOne).toHaveBeenCalledWith({
			where: {
				tenant: { id: 'tenant-id' },
				client: { id: 'client-id' },
				status: MembershipStatus.ACTIVE,
			},
			relations: { tenant: true },
		});
		expect(nutritionPlanRepository.find).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					tenantId: 'tenant-id',
					membershipId: 'membership-id',
					planType: NutritionPlanType.CLIENT,
					status: NutritionPlanStatus.PUBLISHED,
				},
			}),
		);
	});

	it('uses membership ownership in a plan id lookup', async () => {
		await expect(
			service.getPublishedPlan('client-id', 'tenant-id', 'other-plan-id'),
		).rejects.toBeInstanceOf(NotFoundException);

		expect(nutritionPlanRepository.findOne).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					id: 'other-plan-id',
					tenantId: 'tenant-id',
					membershipId: 'membership-id',
					status: NutritionPlanStatus.PUBLISHED,
				}),
			}),
		);
	});

	it('forces the client Food library to active rows', async () => {
		await service.findActiveFoods('client-id', 'tenant-id', {
			search: 'rice',
		});

		expect(foodLibraryService.findFoods).toHaveBeenCalledWith('tenant-id', {
			search: 'rice',
			includeInactive: false,
		});
	});

	it('returns both boundaries of an inclusive calendar range', async () => {
		nutritionPlanRepository.find.mockImplementationOnce(async () => [
			createCalendarPlan(),
		]);

		const result = await service.getCalendar('client-id', 'tenant-id', {
			from: '2026-07-16',
			to: '2026-07-17',
		});

		expect(result.map((day) => day.scheduledDate)).toEqual([
			'2026-07-16',
			'2026-07-17',
		]);
	});

	it('accepts exactly 366 inclusive calendar days', async () => {
		await expect(
			service.getCalendar('client-id', 'tenant-id', {
				from: '2026-02-01',
				to: '2027-02-01',
			}),
		).resolves.toEqual([]);
	});

	it('rejects 367 inclusive calendar days before querying plans', async () => {
		await expect(
			service.getCalendar('client-id', 'tenant-id', {
				from: '2026-02-01',
				to: '2027-02-02',
			}),
		).rejects.toEqual(
			expect.objectContaining({
				message: 'Calendar range cannot exceed 366 inclusive calendar days',
			}),
		);
		expect(nutritionPlanRepository.find).not.toHaveBeenCalled();
	});

	it('still accepts historical and future ranges', async () => {
		await expect(
			service.getCalendar('client-id', 'tenant-id', {
				from: '1999-01-01',
				to: '1999-12-31',
			}),
		).resolves.toEqual([]);
		await expect(
			service.getCalendar('client-id', 'tenant-id', {
				from: '2030-01-01',
				to: '2030-12-31',
			}),
		).resolves.toEqual([]);
	});

	it('rejects a reversed calendar range', async () => {
		await expect(
			service.getCalendar('client-id', 'tenant-id', {
				from: '2026-07-02',
				to: '2026-07-01',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('omits coach-only archive state from every client plan response', async () => {
		const plan = createCalendarPlan();
		nutritionPlanRepository.find
			.mockImplementationOnce(async () => [plan])
			.mockImplementationOnce(async () => [plan]);
		nutritionPlanRepository.findOne.mockImplementationOnce(async () => plan);

		const list = await service.listPublishedPlans('client-id', 'tenant-id');
		const current = await service.getCurrentPublishedPlan(
			'client-id',
			'tenant-id',
		);
		const detail = await service.getPublishedPlan(
			'client-id',
			'tenant-id',
			'plan-id',
		);

		expect(list[0]).not.toHaveProperty('isArchived');
		expect(current).not.toHaveProperty('isArchived');
		expect(detail).not.toHaveProperty('isArchived');
		expect(list[0]).toHaveProperty('membershipId', 'membership-id');
		expect(list[0]).toHaveProperty('membership', null);
	});
});

function createCalendarPlan() {
	const days = [1, 2, 3, 4].map((dayNumber) => ({
		id: `day-${dayNumber}`,
		dayNumber,
		isFlexibleDay: true,
		targetCaloriesOverride: null,
		targetProteinGOverride: null,
		targetCarbsGOverride: null,
		targetFatGOverride: null,
		targetFiberGOverride: null,
		targetWaterMlOverride: null,
		notes: null,
		meals: [],
	}));

	return {
		id: 'plan-id',
		membershipId: 'membership-id',
		membership: null,
		name: 'Published plan',
		description: null,
		goal: null,
		durationWeeks: 1,
		startDate: '2026-07-15',
		endDate: '2026-07-21',
		targetCalories: 2000,
		targetProteinG: 140,
		targetCarbsG: 220,
		targetFatG: 65,
		targetFiberG: 30,
		targetWaterMl: 2500,
		status: NutritionPlanStatus.PUBLISHED,
		isArchived: false,
		createdAt: new Date('2026-07-01T00:00:00.000Z'),
		updatedAt: new Date('2026-07-01T00:00:00.000Z'),
		weeks: [{ id: 'week-id', weekNumber: 1, notes: null, days }],
	} as never;
}
