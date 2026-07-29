import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiConflictResponse,
	ApiCreatedResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { CurrentClient, CurrentTenant, Public } from '../../../auth';
import { ClientJwtAuthGuard } from '../../../auth/guards/client-jwt-auth.guard';
import { ClientNutritionApiErrorResponseDto } from '../dto/client-nutrition-response.dto';
import { ClientNutritionDayLogDetailResponseDto } from '../dto/nutrition-logging-response.dto';
import {
	CreateActualFoodLogDto,
	UpdateActualFoodLogDto,
	UpdateLoggedMealOutcomeDto,
	UpdateNutritionDayLogDto,
} from '../dto/nutrition-logging.dto';
import { ClientNutritionActualFoodService } from '../services/client-nutrition-actual-food.service';
import { ClientNutritionLoggingService } from '../services/client-nutrition-logging.service';

@ApiTags('Client - Nutrition Logging')
@ApiBearerAuth()
@Public()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/me/nutrition')
export class ClientNutritionLoggingController {
	constructor(
		private readonly clientNutritionLoggingService: ClientNutritionLoggingService,
		private readonly clientNutritionActualFoodService: ClientNutritionActualFoodService,
	) {}

	@Post('days/:dayId/log')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Start or resume my nutrition log for one day',
		description:
			'Creates the day log on first use and snapshots the prescribed Meals into logged Meals. If a writable log already exists, it returns that same log without creating duplicates.',
	})
	@ApiOkResponse({
		description: 'Nutrition day log started or resumed',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'dayId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
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
	@ApiOperation({
		summary: 'Skip and finalize one prescribed nutrition day',
		description:
			'Marks the whole prescribed day as skipped and finalizes it. This is for a day with planned Meals; a fully flexible day with no planned Meals has nothing to skip.',
	})
	@ApiOkResponse({
		description: 'Nutrition day skipped',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'dayId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
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
	@ApiOperation({
		summary: 'Get one of my nutrition day logs',
		description:
			'Returns the complete log owned by the active client membership, including prescribed Meal outcomes, actual Food diary entries, totals, and final state.',
	})
	@ApiOkResponse({
		description: 'Nutrition day log retrieved',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'logId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
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
	@ApiOperation({
		summary: 'Update water or client notes on my nutrition log',
		description:
			'Updates only the supplied water intake or client notes while the log is writable. This endpoint does not change Meal outcomes or actual Food entries.',
	})
	@ApiOkResponse({
		description: 'Nutrition day log updated',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiBadRequestResponse({
		description:
			'logId is invalid, no supported field was supplied, or a value is invalid',
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
	@ApiOperation({
		summary: 'Report the outcome of one prescribed Meal',
		description:
			'Records whether the client ate, partly ate, or skipped one prescribed Meal, with optional notes. This describes prescription adherence; actual Foods are recorded separately in the Food diary.',
	})
	@ApiOkResponse({
		description: 'Logged Meal outcome updated',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiBadRequestResponse({
		description:
			'A path identifier, the Meal outcome, or the notes are invalid',
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

	@Post('logs/:logId/foods')
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({
		summary: 'Add a library-backed or manual actual Food entry',
		description:
			'Library entries use foodId and amount. Manual entries omit foodId and provide foodName with optional total nutrients.',
	})
	@ApiCreatedResponse({
		description: 'Actual Food entry created and updated log totals returned',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiBadRequestResponse({
		description:
			'logId, the library/manual entry shape, or a supplied value is invalid',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description:
			'Nutrition log, active library Food, or linked Logged Meal not found for this membership',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description: 'The log is finalized or its write deadline passed',
		type: ClientNutritionApiErrorResponseDto,
	})
	createActualFood(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('logId', ParseUUIDPipe) logId: string,
		@Body() body: CreateActualFoodLogDto,
	) {
		return this.clientNutritionActualFoodService.createActualFood(
			clientId,
			tenantId,
			logId,
			body,
		);
	}

	@Patch('logs/:logId/foods/:foodLogId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Update one actual Food entry while its log is writable',
		description:
			'Updates supplied fields on one diary entry. It may remain library-backed, switch to another active library Food, or become manual when foodId is set to null and a manual definition is supplied. Totals are recalculated.',
	})
	@ApiOkResponse({
		description: 'Actual Food entry updated and recalculated log returned',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiBadRequestResponse({
		description:
			'A path identifier is invalid, no supported field was supplied, or the entry shape is invalid',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description:
			'Nutrition log, actual Food, active library Food, or linked Logged Meal not found',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description: 'The log is finalized or its write deadline passed',
		type: ClientNutritionApiErrorResponseDto,
	})
	updateActualFood(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('logId', ParseUUIDPipe) logId: string,
		@Param('foodLogId', ParseUUIDPipe) foodLogId: string,
		@Body() body: UpdateActualFoodLogDto,
	) {
		return this.clientNutritionActualFoodService.updateActualFood(
			clientId,
			tenantId,
			logId,
			foodLogId,
			body,
		);
	}

	@Delete('logs/:logId/foods/:foodLogId')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Delete one actual Food entry while its log is writable',
		description:
			'Removes one Food diary entry from this log and returns the complete log with recalculated actual totals.',
	})
	@ApiOkResponse({
		description: 'Actual Food entry deleted and recalculated log returned',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'logId or foodLogId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiNotFoundResponse({
		description: 'Nutrition log or actual Food entry not found',
		type: ClientNutritionApiErrorResponseDto,
	})
	@ApiConflictResponse({
		description: 'The log is finalized or its write deadline passed',
		type: ClientNutritionApiErrorResponseDto,
	})
	deleteActualFood(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string | null,
		@Param('logId', ParseUUIDPipe) logId: string,
		@Param('foodLogId', ParseUUIDPipe) foodLogId: string,
	) {
		return this.clientNutritionActualFoodService.deleteActualFood(
			clientId,
			tenantId,
			logId,
			foodLogId,
		);
	}

	@Post('logs/:logId/complete')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Complete and finalize my nutrition day log',
		description:
			'Finalizes the log after every prescribed Meal has a reported outcome. The server derives the final adherence result and prevents later edits.',
	})
	@ApiOkResponse({
		description: 'Nutrition day log completed',
		type: ClientNutritionDayLogDetailResponseDto,
	})
	@ApiBadRequestResponse({
		description: 'logId is not a valid UUID.',
		type: ClientNutritionApiErrorResponseDto,
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
}
