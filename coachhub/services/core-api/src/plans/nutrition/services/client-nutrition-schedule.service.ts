import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { ClientIntake } from '../../../clients/entities/client-intake.entity';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import {
	addDaysToDateOnly,
	getDateOnlyInTimeZone,
	isValidDateOnly,
	MembershipStatus,
	NutritionPlanStatus,
	NutritionPlanType,
} from '../../../common';
import { ClientFoodLibraryQueryDto } from '../dto/client-food-library-query.dto';
import {
	CLIENT_NUTRITION_CALENDAR_MAX_DAYS,
	ClientNutritionCalendarQueryDto,
} from '../dto/client-nutrition-calendar-query.dto';
import { NutritionDayLog } from '../entities/nutrition-day-log.entity';
import { NutritionPlanDay } from '../entities/nutrition-plan-day.entity';
import { NutritionPlan } from '../entities/nutrition-plan.entity';
import {
	deriveNutritionPlanSchedulePhase,
	mapClientNutritionDay,
	mapClientNutritionPlanBuilder,
	mapClientNutritionPlanSummary,
} from '../utils/client-nutrition-plan.utils';
import {
	getDietaryAdvisoryNotice,
	mapClientDietaryProfile,
} from '../utils/nutrition-builder.utils';
import {
	mapNutritionDayLogState,
	NutritionLogStateSource,
} from '../utils/nutrition-log-state.utils';
import { FoodLibraryService } from './food-library.service';

@Injectable()
export class ClientNutritionScheduleService {
	constructor(
		@InjectRepository(ClientMembership)
		private readonly membershipRepository: Repository<ClientMembership>,
		@InjectRepository(ClientIntake)
		private readonly clientIntakeRepository: Repository<ClientIntake>,
		@InjectRepository(NutritionPlan)
		private readonly nutritionPlanRepository: Repository<NutritionPlan>,
		@InjectRepository(NutritionPlanDay)
		private readonly nutritionPlanDayRepository: Repository<NutritionPlanDay>,
		@InjectRepository(NutritionDayLog)
		private readonly nutritionDayLogRepository: Repository<NutritionDayLog>,
		private readonly foodLibraryService: FoodLibraryService,
	) {}

	async listPublishedPlans(clientId: string, tenantId: string | null) {
		const membership = await this.getActiveMembership(clientId, tenantId);
		const plans = await this.nutritionPlanRepository.find({
			where: this.publishedPlanScope(membership.tenant.id, membership.id),
			order: { startDate: 'DESC', createdAt: 'DESC' },
		});

		return plans.map((plan) =>
			omitCoachPlanFields(
				mapClientNutritionPlanSummary(plan, membership.tenant.timezone),
			),
		);
	}

	async getCurrentPublishedPlan(clientId: string, tenantId: string | null) {
		const membership = await this.getActiveMembership(clientId, tenantId);
		const today = getDateOnlyInTimeZone(new Date(), membership.tenant.timezone);
		const plans = await this.nutritionPlanRepository.find({
			where: {
				...this.publishedPlanScope(membership.tenant.id, membership.id),
				startDate: LessThanOrEqual(today),
				endDate: MoreThanOrEqual(today),
			},
			relations: this.builderRelations(),
			order: this.builderOrder(),
		});

		if (plans.length === 0) {
			throw new NotFoundException(
				'Current published client nutrition plan not found',
			);
		}
		if (plans.length > 1) {
			throw new ConflictException(
				'Multiple active published client nutrition plans were found',
			);
		}

		const mapped = omitCoachPlanFields(
			await this.mapPlanWithLogState(plans[0], membership),
		);
		const currentDay = mapped.weeks
			.flatMap((week) => week.days)
			.find((day) => day.scheduledDate === today);

		return { ...mapped, currentDay: currentDay ?? null };
	}

	async getPublishedPlan(
		clientId: string,
		tenantId: string | null,
		planId: string,
	) {
		const membership = await this.getActiveMembership(clientId, tenantId);
		const plan = await this.nutritionPlanRepository.findOne({
			where: {
				...this.publishedPlanScope(membership.tenant.id, membership.id),
				id: planId,
			},
			relations: this.builderRelations(),
			order: this.builderOrder(),
		});
		if (!plan) {
			throw new NotFoundException('Published client nutrition plan not found');
		}

		return omitCoachPlanFields(
			await this.mapPlanWithLogState(plan, membership),
		);
	}

	async getCalendar(
		clientId: string,
		tenantId: string | null,
		query: ClientNutritionCalendarQueryDto,
	) {
		this.assertCalendarRange(query);
		const membership = await this.getActiveMembership(clientId, tenantId);
		const plans = await this.nutritionPlanRepository.find({
			where: {
				...this.publishedPlanScope(membership.tenant.id, membership.id),
				startDate: LessThanOrEqual(query.to),
				endDate: MoreThanOrEqual(query.from),
			},
			relations: this.builderRelations(),
			order: {
				startDate: 'ASC',
				...this.builderOrder(),
			},
		});
		const [dietaryProfile, logsByDayId] = await Promise.all([
			this.loadDietaryProfile(membership),
			this.loadLogState(
				membership,
				plans.map((plan) => plan.id),
			),
		]);

		const calendar = plans.flatMap((plan) => {
			const mapped = mapClientNutritionPlanBuilder(
				plan,
				membership.tenant.timezone,
				dietaryProfile,
			);
			return mapped.weeks.flatMap((week) =>
				week.days.flatMap((day) => {
					if (day.scheduledDate < query.from || day.scheduledDate > query.to) {
						return [];
					}

					return [
						{
							planId: plan.id,
							planName: plan.name,
							planSchedulePhase: mapped.schedulePhase,
							dietaryAdvisoryNotice: mapped.dietaryAdvisoryNotice,
							weekNumber: week.weekNumber,
							...day,
							...mapNutritionDayLogState(
								logsByDayId.get(day.id) ?? null,
								day.scheduledDate,
								membership.tenant.timezone,
							),
						},
					];
				}),
			);
		});

		return calendar.sort((left, right) =>
			left.scheduledDate.localeCompare(right.scheduledDate),
		);
	}

	async getPublishedDay(
		clientId: string,
		tenantId: string | null,
		dayId: string,
	) {
		const membership = await this.getActiveMembership(clientId, tenantId);
		const day = await this.nutritionPlanDayRepository.findOne({
			where: {
				id: dayId,
				tenantId: membership.tenant.id,
				nutritionPlanWeek: {
					nutritionPlan: {
						tenantId: membership.tenant.id,
						membershipId: membership.id,
						planType: NutritionPlanType.CLIENT,
						status: NutritionPlanStatus.PUBLISHED,
					},
				},
			},
			relations: {
				nutritionPlanWeek: { nutritionPlan: true },
				meals: { foods: true },
			},
			order: {
				meals: { position: 'ASC', foods: { position: 'ASC' } },
			},
		});
		if (!day) {
			throw new NotFoundException(
				'Published client nutrition plan day not found',
			);
		}

		const week = day.nutritionPlanWeek;
		const plan = week.nutritionPlan;
		const [dietaryProfile, logsByDayId] = await Promise.all([
			this.loadDietaryProfile(membership),
			this.loadLogState(membership, [plan.id]),
		]);
		const mappedDay = mapClientNutritionDay(
			plan,
			week.weekNumber,
			day,
			dietaryProfile,
		);

		return {
			planId: plan.id,
			planName: plan.name,
			planSchedulePhase: deriveNutritionPlanSchedulePhase(
				plan,
				membership.tenant.timezone,
			),
			clientDietaryProfile: mapClientDietaryProfile(dietaryProfile),
			dietaryAdvisoryNotice: getDietaryAdvisoryNotice(),
			weekNumber: week.weekNumber,
			...mappedDay,
			...mapNutritionDayLogState(
				logsByDayId.get(day.id) ?? null,
				mappedDay.scheduledDate,
				membership.tenant.timezone,
			),
		};
	}

	//**
	// ==================================================
	// =            HELPERS                             =
	// =                                                =
	// ====================================================
	//   */
	async findActiveFoods(
		clientId: string,
		tenantId: string | null,
		query: ClientFoodLibraryQueryDto,
	) {
		const membership = await this.getActiveMembership(clientId, tenantId);
		const foods = await this.foodLibraryService.findFoods(
			membership.tenant.id,
			{ ...query, includeInactive: false },
		);

		return foods.map((food) => ({
			id: food.id,
			name: food.name,
			brand: food.brand,
			servingSize: food.servingSize,
			servingUnit: food.servingUnit,
			calories: food.calories,
			proteinG: food.proteinG,
			carbsG: food.carbsG,
			fatG: food.fatG,
			fiberG: food.fiberG,
			dietaryTags: food.dietaryTags,
			allergens: food.allergens,
			isActive: food.isActive,
			createdAt: food.createdAt,
			updatedAt: food.updatedAt,
		}));
	}

	private async getActiveMembership(clientId: string, tenantId: string | null) {
		if (!tenantId) {
			throw new BadRequestException('No active tenant selected');
		}

		const membership = await this.membershipRepository.findOne({
			where: {
				tenant: { id: tenantId },
				client: { id: clientId },
				status: MembershipStatus.ACTIVE,
			},
			relations: { tenant: true },
		});
		if (!membership) {
			throw new NotFoundException('Active client membership not found');
		}
		return membership;
	}

	private publishedPlanScope(tenantId: string, membershipId: string) {
		return {
			tenantId,
			membershipId,
			planType: NutritionPlanType.CLIENT,
			status: NutritionPlanStatus.PUBLISHED,
		};
	}

	private builderRelations() {
		return { weeks: { days: { meals: { foods: true } } } } as const;
	}

	private builderOrder() {
		return {
			weeks: {
				weekNumber: 'ASC' as const,
				days: {
					dayNumber: 'ASC' as const,
					meals: {
						position: 'ASC' as const,
						foods: { position: 'ASC' as const },
					},
				},
			},
		};
	}

	private async loadDietaryProfile(membership: ClientMembership) {
		return this.clientIntakeRepository.findOne({
			where: {
				membership: { id: membership.id },
				tenant: { id: membership.tenant.id },
			},
		});
	}

	private async mapPlanWithLogState(
		plan: NutritionPlan,
		membership: ClientMembership,
	) {
		const [dietaryProfile, logsByDayId] = await Promise.all([
			this.loadDietaryProfile(membership),
			this.loadLogState(membership, [plan.id]),
		]);
		const mapped = mapClientNutritionPlanBuilder(
			plan,
			membership.tenant.timezone,
			dietaryProfile,
		);

		return {
			...mapped,
			weeks: mapped.weeks.map((week) => ({
				...week,
				days: week.days.map((day) => ({
					...day,
					...mapNutritionDayLogState(
						logsByDayId.get(day.id) ?? null,
						day.scheduledDate,
						membership.tenant.timezone,
					),
				})),
			})),
		};
	}

	// IDON'T Understand this fucntion, so explain it line by line
	private async loadLogState(membership: ClientMembership, planIds: string[]) {
		const byDayId = new Map<string, NutritionLogStateSource>();
		if (planIds.length === 0) return byDayId;

		const logs = await this.nutritionDayLogRepository.find({
			where: {
				tenantId: membership.tenant.id,
				membershipId: membership.id,
				nutritionPlanId: In(planIds),
			},
		});
		for (const log of logs) {
			byDayId.set(log.nutritionPlanDayId, {
				id: log.id,
				status: log.status,
				adherenceOutcome: log.adherenceOutcome,
				startedAt: log.startedAt,
				completedAt: log.completedAt,
				updatedAt: log.updatedAt,
			});
		}
		return byDayId;
	}

	private assertCalendarRange(query: ClientNutritionCalendarQueryDto) {
		if (!isValidDateOnly(query.from) || !isValidDateOnly(query.to)) {
			throw new BadRequestException('Calendar range dates must be valid');
		}
		if (query.from > query.to) {
			throw new BadRequestException(
				'Calendar range from date cannot be after to date',
			);
		}
		const maximumToDate = addDaysToDateOnly(
			query.from,
			CLIENT_NUTRITION_CALENDAR_MAX_DAYS - 1,
		);
		if (query.to > maximumToDate) {
			throw new BadRequestException(
				`Calendar range cannot exceed ${CLIENT_NUTRITION_CALENDAR_MAX_DAYS} inclusive calendar days`,
			);
		}
	}
}

function omitCoachPlanFields<T extends { isArchived: boolean }>(
	plan: T,
): Omit<T, 'isArchived'> {
	const { isArchived: _isArchived, ...clientPlan } = plan;
	return clientPlan;
}
