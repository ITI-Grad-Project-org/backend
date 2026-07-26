import {
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
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
	ClientCurrentNutritionPlanResponseDto,
	ClientFoodResponseDto,
	ClientNutritionApiErrorResponseDto,
	ClientNutritionCalendarItemResponseDto,
	ClientNutritionDayDetailResponseDto,
	ClientNutritionPlanResponseDto,
	ClientNutritionPlanSummaryResponseDto,
} from '../dto/client-nutrition-response.dto';
import { ClientNutritionScheduleService } from '../services/client-nutrition-schedule.service';

@ApiTags('client/me/nutrition')
@ApiBearerAuth()
@Public()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/me/nutrition')
export class ClientNutritionController {
	constructor(
		private readonly clientNutritionScheduleService: ClientNutritionScheduleService,
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
