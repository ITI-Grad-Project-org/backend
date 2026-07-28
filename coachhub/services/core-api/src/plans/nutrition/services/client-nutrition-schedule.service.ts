import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { ClientIntake } from '../../../clients/entities/client-intake.entity';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import {
	addDaysToDateOnly,
	getDateOnlyInTimeZone,
	isValidDateOnly,
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
	mapClientNutritionDay,
	mapClientNutritionPlanBuilder,
	mapClientNutritionPlanSummary,
	omitCoachPlanFields,
} from '../mappers/client-nutrition-plan.mapper';
import { findActiveClientNutritionMembership } from '../persistence/client-nutrition-access.persistence';
import {
	clientNutritionPlanBuilderOrder,
	clientNutritionPlanBuilderRelations,
	loadClientDietaryProfile,
	loadNutritionLogStates,
	publishedClientNutritionPlanScope,
} from '../persistence/client-nutrition-schedule.persistence';
import { deriveNutritionPlanSchedulePhase } from '../utils/client-nutrition-plan.utils';
import {
	getDietaryAdvisoryNotice,
	mapClientDietaryProfile,
} from '../utils/nutrition-dietary-advisory.utils';
import { mapNutritionDayLogState } from '../utils/nutrition-log-state.utils';
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
			where: publishedClientNutritionPlanScope(
				membership.tenant.id,
				membership.id,
			),
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
				...publishedClientNutritionPlanScope(
					membership.tenant.id,
					membership.id,
				),
				startDate: LessThanOrEqual(today),
				endDate: MoreThanOrEqual(today),
			},
			relations: clientNutritionPlanBuilderRelations(),
			order: clientNutritionPlanBuilderOrder(),
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
				...publishedClientNutritionPlanScope(
					membership.tenant.id,
					membership.id,
				),
				id: planId,
			},
			relations: clientNutritionPlanBuilderRelations(),
			order: clientNutritionPlanBuilderOrder(),
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
				...publishedClientNutritionPlanScope(
					membership.tenant.id,
					membership.id,
				),
				startDate: LessThanOrEqual(query.to),
				endDate: MoreThanOrEqual(query.from),
			},
			relations: clientNutritionPlanBuilderRelations(),
			order: {
				startDate: 'ASC',
				...clientNutritionPlanBuilderOrder(),
			},
		});
		const [dietaryProfile, logsByDayId] = await Promise.all([
			loadClientDietaryProfile(this.clientIntakeRepository, membership),
			loadNutritionLogStates(
				this.nutritionDayLogRepository,
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
			loadClientDietaryProfile(this.clientIntakeRepository, membership),
			loadNutritionLogStates(this.nutritionDayLogRepository, membership, [
				plan.id,
			]),
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
		return findActiveClientNutritionMembership(
			this.membershipRepository,
			clientId,
			tenantId,
		);
	}

	private async mapPlanWithLogState(
		plan: NutritionPlan,
		membership: ClientMembership,
	) {
		const [dietaryProfile, logsByDayId] = await Promise.all([
			loadClientDietaryProfile(this.clientIntakeRepository, membership),
			loadNutritionLogStates(this.nutritionDayLogRepository, membership, [
				plan.id,
			]),
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
