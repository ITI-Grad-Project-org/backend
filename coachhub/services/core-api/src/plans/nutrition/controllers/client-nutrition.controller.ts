import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiConflictResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentClient, CurrentTenant, Public } from '../../../auth';
import { ClientJwtAuthGuard } from '../../../auth/guards/client-jwt-auth.guard';
import { ClientFoodLibraryQueryDto } from '../dto/client-food-library-query.dto';
import { ClientNutritionCalendarQueryDto } from '../dto/client-nutrition-calendar-query.dto';
import { ClientNutritionPlanListQueryDto } from '../dto/client-nutrition-plan-list-query.dto';
import {
	ClientNutritionDayLogDetailResponseDto,
	UpdateLoggedMealOutcomeDto,
	UpdateNutritionDayLogDto,
} from '../dto/nutrition-logging.dto';
import {
	ClientCurrentNutritionPlanResponseDto,
	ClientFoodResponseDto,
	ClientNutritionApiErrorResponseDto,
	ClientNutritionCalendarItemResponseDto,
	ClientNutritionDayDetailResponseDto,
	ClientNutritionPlanResponseDto,
	ClientNutritionPlanSummaryResponseDto,
} from '../dto/client-nutrition-response.dto';
import { ClientNutritionLoggingService } from '../services/client-nutrition-logging.service';
import { ClientNutritionScheduleService } from '../services/client-nutrition-schedule.service';

@ApiTags('client/me/nutrition')
@ApiBearerAuth()
@Public()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/me/nutrition')
export class ClientNutritionController {
	constructor(
		private readonly clientNutritionScheduleService: ClientNutritionScheduleService,
		private readonly clientNutritionLoggingService: ClientNutritionLoggingService,
	) {}

	@Get('plans')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'List my published nutrition plans',
		description:
			'Returns published plans for the active client membership. This endpoint currently accepts no query parameters.',
	})
	@ApiOkResponse({
		description: 'Published plans retrieved',
		type: ClientNutritionPlanSummaryResponseDto,
		isArray: true,
	})
	@ApiBadRequestResponse({
		description: 'An unsupported query parameter was supplied',
		type: ClientNutritionApiErrorResponseDto,
	})
	listPlans(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Query() _query: ClientNutritionPlanListQueryDto,
	) {
		return this.clientNutritionScheduleService.listPublishedPlans(
			clientId,
			tenantId,
		);
	}

	@Get('plans/current')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get my currently active nutrition plan' })
	@ApiOkResponse({
		description: 'Current plan retrieved',
		type: ClientCurrentNutritionPlanResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'Current published plan not found',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description:
			'More than one published plan covers today; the conflicting data must be corrected',
		type: ClientNutritionApiErrorResponseDto,
	})
	getCurrentPlan(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
	) {
		return this.clientNutritionScheduleService.getCurrentPublishedPlan(
			clientId,
			tenantId,
		);
	}

	@Get('plans/:planId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get my complete published nutrition plan' })
	@ApiOkResponse({
		description: 'Published plan retrieved',
		type: ClientNutritionPlanResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'Published plan not found for the active client membership',
		type: ClientNutritionApiErrorResponseDto,
	})
	getPlan(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('planId', ParseUUIDPipe) planId: string,
	) {
		return this.clientNutritionScheduleService.getPublishedPlan(
			clientId,
			tenantId,
			planId,
		);
	}

	@Get('calendar')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Get my nutrition calendar in an inclusive range',
		description:
			'Returns published nutrition-plan days from from through to, including both dates. Each request may cover at most 366 calendar days. Historical and future dates are allowed, and ranges with no matching data return an empty array. For example, 2026-02-01 through 2027-02-01 is valid (366 inclusive days), while ending on 2027-02-02 is rejected.',
	})
	@ApiOkResponse({
		description:
			'Calendar days in scheduled-date order; an empty array means no published days match the range',
		type: ClientNutritionCalendarItemResponseDto,
		isArray: true,
	})
	@ApiBadRequestResponse({
		description:
			'from or to is missing/invalid, from is after to, or the inclusive range exceeds 366 calendar days',
		type: ClientNutritionApiErrorResponseDto,
	})
	getCalendar(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Query() query: ClientNutritionCalendarQueryDto,
	) {
		return this.clientNutritionScheduleService.getCalendar(
			clientId,
			tenantId,
			query,
		);
	}

	@Get('days/:dayId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get one published nutrition day prescription' })
	@ApiOkResponse({
		description: 'Nutrition day retrieved',
		type: ClientNutritionDayDetailResponseDto,
	})
	@ApiNotFoundResponse({
		description:
			'Published nutrition day not found for the active client membership',
		type: ClientNutritionApiErrorResponseDto,
	})
	getDay(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('dayId', ParseUUIDPipe) dayId: string,
	) {
		return this.clientNutritionScheduleService.getPublishedDay(
			clientId,
			tenantId,
			dayId,
		);
	}

	@Post('days/:dayId/log')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Start or resume my nutrition log for one day' })
	@ApiOkResponse({
		description: 'Nutrition day log started or resumed',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'Published nutrition day not found for the active membership',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description:
			'The day is in the future, its deadline passed, its plan was cancelled, or its log is finalized',
		type: ClientNutritionApiErrorResponseDto,
	})
	startOrResumeLog(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('dayId', ParseUUIDPipe) dayId: string,
	) {
		return this.clientNutritionLoggingService.startOrResumeLog(
			clientId,
			tenantId,
			dayId,
		);
	}

	@Post('days/:dayId/skip')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Skip and finalize one prescribed nutrition day' })
	@ApiOkResponse({
		description: 'Nutrition day skipped',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'Published nutrition day not found for the active membership',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description:
			'The day is not writable, is fully flexible without planned Meals, or its log is finalized',
		type: ClientNutritionApiErrorResponseDto,
	})
	skipDay(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('dayId', ParseUUIDPipe) dayId: string,
	) {
		return this.clientNutritionLoggingService.skipDay(
			clientId,
			tenantId,
			dayId,
		);
	}

	@Get('logs/:logId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get one of my nutrition day logs' })
	@ApiOkResponse({
		description: 'Nutrition day log retrieved',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'Nutrition day log not found for the active membership',
		type: ClientNutritionApiErrorResponseDto,
	})
	getLog(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('logId', ParseUUIDPipe) logId: string,
	) {
		return this.clientNutritionLoggingService.getLog(clientId, tenantId, logId);
	}

	@Patch('logs/:logId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Update water or client notes on my nutrition log' })
	@ApiOkResponse({
		description: 'Nutrition day log updated',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'No supported field was supplied or a value is invalid',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'Nutrition day log not found for the active membership',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description: 'The log is finalized or its write deadline passed',
		type: ClientNutritionApiErrorResponseDto,
	})
	updateLog(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('logId', ParseUUIDPipe) logId: string,
		@Body() body: UpdateNutritionDayLogDto,
	) {
		return this.clientNutritionLoggingService.updateLog(
			clientId,
			tenantId,
			logId,
			body,
		);
	}

	@Patch('logs/:logId/meals/:loggedMealId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Report the outcome of one prescribed Meal' })
	@ApiOkResponse({
		description: 'Logged Meal outcome updated',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'The Meal outcome or notes are invalid',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'Nutrition log or Logged Meal not found for this membership',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description: 'The log is finalized or its write deadline passed',
		type: ClientNutritionApiErrorResponseDto,
	})
	updateMealOutcome(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('logId', ParseUUIDPipe) logId: string,
		@Param('loggedMealId', ParseUUIDPipe) loggedMealId: string,
		@Body() body: UpdateLoggedMealOutcomeDto,
	) {
		return this.clientNutritionLoggingService.updateMealOutcome(
			clientId,
			tenantId,
			logId,
			loggedMealId,
			body,
		);
	}

	@Post('logs/:logId/complete')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Complete and finalize my nutrition day log' })
	@ApiOkResponse({
		description: 'Nutrition day log completed',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'Nutrition day log not found for the active membership',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description:
			'A planned Meal is still pending, the log is finalized, or its deadline passed',
		type: ClientNutritionApiErrorResponseDto,
	})
	completeLog(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('logId', ParseUUIDPipe) logId: string,
	) {
		return this.clientNutritionLoggingService.completeLog(
			clientId,
			tenantId,
			logId,
		);
	}

	@Get('library/foods')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'List active Foods in my selected tenant',
		description:
			'Search is a case-insensitive literal substring match against name and brand. Characters such as %, _, and backslash are treated as normal text, not SQL wildcards.',
	})
	@ApiOkResponse({
		description: 'Active Foods retrieved',
		type: ClientFoodResponseDto,
		isArray: true,
	})
	findFoods(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Query() query: ClientFoodLibraryQueryDto,
	) {
		return this.clientNutritionScheduleService.findActiveFoods(
			clientId,
			tenantId,
			query,
		);
	}
}
