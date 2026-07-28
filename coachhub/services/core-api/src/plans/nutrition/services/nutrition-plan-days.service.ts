import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UpdateNutritionPlanDayDto } from '../dto/nutrition-builder.dto';
import { NutritionPlanDay } from '../entities/nutrition-plan-day.entity';
import { lockEditableNutritionDay } from '../persistence/nutrition-builder.persistence';
import {
	assertNutritionTenant,
	normalizeNutritionPlanText,
} from '../utils/client-nutrition-plan.utils';
import { ClientNutritionPlansService } from './client-nutrition-plans.service';

@Injectable()
export class NutritionPlanDaysService {
	constructor(
		private readonly dataSource: DataSource,
		private readonly clientNutritionPlansService: ClientNutritionPlansService,
	) {}

	async updatePlanDay(
		tenantId: string | null,
		planId: string,
		dayId: string,
		body: UpdateNutritionPlanDayDto,
	) {
		const activeTenantId = assertNutritionTenant(tenantId);
		await this.dataSource.transaction(async (manager) => {
			const day = await lockEditableNutritionDay(
				manager,
				activeTenantId,
				planId,
				dayId,
			);

			if (body.isFlexibleDay !== undefined) {
				day.isFlexibleDay = body.isFlexibleDay;
			}
			if (body.notes !== undefined) {
				day.notes = normalizeNutritionPlanText(body.notes);
			}
			if (body.targetCaloriesOverride !== undefined) {
				day.targetCaloriesOverride = body.targetCaloriesOverride;
			}
			if (body.targetProteinGOverride !== undefined) {
				day.targetProteinGOverride = body.targetProteinGOverride;
			}
			if (body.targetCarbsGOverride !== undefined) {
				day.targetCarbsGOverride = body.targetCarbsGOverride;
			}
			if (body.targetFatGOverride !== undefined) {
				day.targetFatGOverride = body.targetFatGOverride;
			}
			if (body.targetFiberGOverride !== undefined) {
				day.targetFiberGOverride = body.targetFiberGOverride;
			}
			if (body.targetWaterMlOverride !== undefined) {
				day.targetWaterMlOverride = body.targetWaterMlOverride;
			}

			await manager.getRepository(NutritionPlanDay).save(day);
		});

		const plan = await this.clientNutritionPlansService.getClientPlan(
			activeTenantId,
			planId,
		);
		const updatedDay = plan.weeks
			.flatMap((week) => week.days)
			.find((day) => day.id === dayId);
		if (!updatedDay) {
			throw new NotFoundException('Nutrition plan day not found');
		}
		return updatedDay;
	}
}
