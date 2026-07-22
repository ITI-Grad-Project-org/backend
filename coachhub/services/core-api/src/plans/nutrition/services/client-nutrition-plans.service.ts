import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ClientIntake } from '../../../clients/entities/client-intake.entity';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import {
	deriveInclusiveEndDate,
	MembershipStatus,
	NutritionPlanStatus,
	NutritionPlanType,
} from '../../../common';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import {
	CreateClientNutritionPlanDto,
	UpdateClientNutritionPlanDto,
} from '../dto/create-client-nutrition-plan.dto';
import { QueryClientNutritionPlansDto } from '../dto/query-client-nutrition-plans.dto';
import { NutritionPlanDay } from '../entities/nutrition-plan-day.entity';
import { NutritionPlanWeek } from '../entities/nutrition-plan-week.entity';
import { NutritionPlan } from '../entities/nutrition-plan.entity';
import {
	assertNutritionStartDate,
	assertNutritionTenant,
	mapClientNutritionPlanBuilder,
	mapClientNutritionPlanSummary,
	normalizeNutritionPlanText,
} from '../utils/client-nutrition-plan.utils';

@Injectable()
export class ClientNutritionPlansService {
	constructor(
		@InjectRepository(NutritionPlan)
		private readonly nutritionPlanRepository: Repository<NutritionPlan>,
		private readonly dataSource: DataSource,
	) {}

	async createClientPlan(
		tenantId: string | null,
		coachId: string,
		body: CreateClientNutritionPlanDto,
	) {
		const activeTenantId = assertNutritionTenant(tenantId);

		const planId = await this.dataSource.transaction(async (manager) => {
			const tenant = await manager.getRepository(Tenant).findOneBy({
				id: activeTenantId,
			});
			if (!tenant) {
				throw new NotFoundException('Tenant not found');
			}

			const membership = await manager.getRepository(ClientMembership).findOne({
				where: {
					id: body.membershipId,
					tenant: { id: activeTenantId },
					status: MembershipStatus.ACTIVE,
				},
				relations: { client: true },
			});
			if (!membership?.client) {
				throw new NotFoundException('Active client membership not found');
			}

			assertNutritionStartDate(body.startDate, tenant.timezone);

			const planRepository = manager.getRepository(NutritionPlan);
			const weekRepository = manager.getRepository(NutritionPlanWeek);
			const dayRepository = manager.getRepository(NutritionPlanDay);

			const weeks = Array.from({ length: body.durationWeeks }, (_, weekIndex) =>
				weekRepository.create({
					tenantId: activeTenantId,
					weekNumber: weekIndex + 1,
					notes: null,
					days: Array.from({ length: 7 }, (_, dayIndex) =>
						dayRepository.create({
							tenantId: activeTenantId,
							dayNumber: dayIndex + 1,
							isFlexibleDay: false,
							targetCaloriesOverride: null,
							targetProteinGOverride: null,
							targetCarbsGOverride: null,
							targetFatGOverride: null,
							targetFiberGOverride: null,
							targetWaterMlOverride: null,
							notes: null,
							meals: [],
						}),
					),
				}),
			);

			const plan = planRepository.create({
				tenantId: activeTenantId,
				createdBy: { id: coachId },
				planType: NutritionPlanType.CLIENT,
				membershipId: membership.id,
				membership,
				sourceTemplateId: null,
				sourceTemplate: null,
				name: body.name.trim(),
				description: normalizeNutritionPlanText(body.description),
				goal: body.goal ?? null,
				durationWeeks: body.durationWeeks,
				startDate: body.startDate,
				endDate: deriveInclusiveEndDate(body.startDate, body.durationWeeks),
				targetCalories: body.targetCalories ?? null,
				targetProteinG: body.targetProteinG ?? null,
				targetCarbsG: body.targetCarbsG ?? null,
				targetFatG: body.targetFatG ?? null,
				targetFiberG: body.targetFiberG ?? null,
				targetWaterMl: body.targetWaterMl ?? null,
				status: NutritionPlanStatus.DRAFT,
				isArchived: false,
				weeks,
			});

			const savedPlan = await planRepository.save(plan);
			return savedPlan.id;
		});

		return this.getClientPlan(activeTenantId, planId);
	}

	async findClientPlans(
		tenantId: string | null,
		query: QueryClientNutritionPlansDto,
	) {
		const activeTenantId = assertNutritionTenant(tenantId);
		const plansQuery = this.nutritionPlanRepository
			.createQueryBuilder('plan')
			.leftJoinAndSelect('plan.membership', 'membership')
			.leftJoinAndSelect('membership.client', 'client')
			.where('plan.tenant_id = :tenantId', { tenantId: activeTenantId })
			.andWhere('plan.plan_type = :planType', {
				planType: NutritionPlanType.CLIENT,
			})
			.andWhere('plan.is_archived = :isArchived', {
				isArchived: query.isArchived ?? false,
			})
			.orderBy('plan.created_at', 'DESC')
			.addOrderBy('plan.id', 'ASC');

		if (query.membershipId) {
			plansQuery.andWhere('plan.membership_id = :membershipId', {
				membershipId: query.membershipId,
			});
		}
		if (query.status) {
			plansQuery.andWhere('plan.status = :status', {
				status: query.status,
			});
		}
		if (query.goal) {
			plansQuery.andWhere('plan.goal = :goal', { goal: query.goal });
		}
		if (query.search?.trim()) {
			plansQuery.andWhere('plan.name ILIKE :search', {
				search: `%${query.search.trim()}%`,
			});
		}

		const [plans, tenant] = await Promise.all([
			plansQuery.getMany(),
			this.dataSource.getRepository(Tenant).findOneBy({ id: activeTenantId }),
		]);
		if (!tenant) {
			throw new NotFoundException('Tenant not found');
		}

		return plans.map((plan) =>
			mapClientNutritionPlanSummary(plan, tenant.timezone),
		);
	}

	async getClientPlan(tenantId: string | null, planId: string) {
		const activeTenantId = assertNutritionTenant(tenantId);
		const plan = await this.nutritionPlanRepository.findOne({
			where: {
				id: planId,
				tenantId: activeTenantId,
				planType: NutritionPlanType.CLIENT,
			},
			relations: {
				membership: { client: true },
				tenant: true,
				weeks: { days: { meals: { foods: true } } },
			},
			order: {
				weeks: {
					weekNumber: 'ASC',
					days: {
						dayNumber: 'ASC',
						meals: {
							position: 'ASC',
							foods: { position: 'ASC' },
						},
					},
				},
			},
		});

		if (!plan) {
			throw new NotFoundException('Client nutrition plan not found');
		}

		const dietaryProfile = plan.membershipId
			? await this.dataSource.getRepository(ClientIntake).findOne({
					where: {
						membership: { id: plan.membershipId },
						tenant: { id: activeTenantId },
					},
				})
			: null;

		return mapClientNutritionPlanBuilder(
			plan,
			plan.tenant.timezone,
			dietaryProfile,
		);
	}

	async updateClientPlan(
		tenantId: string | null,
		planId: string,
		body: UpdateClientNutritionPlanDto,
	) {
		const activeTenantId = assertNutritionTenant(tenantId);
		const plan = await this.nutritionPlanRepository.findOne({
			where: {
				id: planId,
				tenantId: activeTenantId,
				planType: NutritionPlanType.CLIENT,
			},
			relations: { tenant: true },
		});

		if (!plan) {
			throw new NotFoundException('Client nutrition plan not found');
		}
		if (plan.status !== NutritionPlanStatus.DRAFT) {
			throw new ConflictException(
				'Only draft client nutrition plans can be edited',
			);
		}

		if (body.name !== undefined) plan.name = body.name.trim();
		if (body.description !== undefined) {
			plan.description = normalizeNutritionPlanText(body.description);
		}
		if (body.goal !== undefined) plan.goal = body.goal;
		if (body.startDate !== undefined) {
			assertNutritionStartDate(body.startDate, plan.tenant.timezone);
			plan.startDate = body.startDate;
			plan.endDate = deriveInclusiveEndDate(body.startDate, plan.durationWeeks);
		}
		if (body.targetCalories !== undefined) {
			plan.targetCalories = body.targetCalories;
		}
		if (body.targetProteinG !== undefined) {
			plan.targetProteinG = body.targetProteinG;
		}
		if (body.targetCarbsG !== undefined) {
			plan.targetCarbsG = body.targetCarbsG;
		}
		if (body.targetFatG !== undefined) {
			plan.targetFatG = body.targetFatG;
		}
		if (body.targetFiberG !== undefined) {
			plan.targetFiberG = body.targetFiberG;
		}
		if (body.targetWaterMl !== undefined) {
			plan.targetWaterMl = body.targetWaterMl;
		}

		await this.nutritionPlanRepository.save(plan);
		return this.getClientPlan(activeTenantId, plan.id);
	}
}
