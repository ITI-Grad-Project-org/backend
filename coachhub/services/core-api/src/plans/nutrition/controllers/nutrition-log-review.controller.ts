import {
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
} from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant } from '../../../auth';
import { ClientNutritionApiErrorResponseDto } from '../dto/client-nutrition-response.dto';
import {
	CoachNutritionDayReviewResponseDto,
	CoachNutritionPlanLogsResponseDto,
} from '../dto/nutrition-log-review.dto';
import { NutritionLogReviewService } from '../services/nutrition-log-review.service';

@ApiTags('Coach - Nutrition Log Review')
@ApiBearerAuth()
@Controller('plans/nutrition/client-plans')
export class NutritionLogReviewController {
	constructor(
		private readonly nutritionLogReviewService: NutritionLogReviewService,
	) {}

	@Get(':planId/logs')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Review all nutrition logs for one tenant client plan',
		description:
			'Returns the coach plan summary and every started day log for that plan. Each log includes its state, completion result, prescribed totals, actual totals, and effective targets. Days with no started log are not included.',
	})
	@ApiOkResponse({
		description: 'Nutrition plan logs retrieved',
		type: CoachNutritionPlanLogsResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'planId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'Client nutrition plan not found in the active tenant',
		type: ClientNutritionApiErrorResponseDto,
	})
	listPlanLogs(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
	) {
		return this.nutritionLogReviewService.listPlanLogs(tenantId, planId);
	}

	@Get(':planId/days/:dayId/log')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary:
			'Review one nutrition prescription beside reported and actual intake',
		description:
			'Returns one dated prescription and its client log, if started. The response places prescribed Meals, reported Meal outcomes, actual Food diary entries, totals, target variance, timestamps, and derived log state in one review object.',
	})
	@ApiOkResponse({
		description: 'Nutrition plan day review retrieved',
		type: CoachNutritionDayReviewResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'planId or dayId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description:
			'Client nutrition plan day not found under this plan and active tenant',
		type: ClientNutritionApiErrorResponseDto,
	})
	getPlanDayLog(
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
		@Param('dayId', ParseUUIDPipe) dayId: string,
	) {
		return this.nutritionLogReviewService.getPlanDayLog(
			tenantId,
			planId,
			dayId,
		);
	}
}
