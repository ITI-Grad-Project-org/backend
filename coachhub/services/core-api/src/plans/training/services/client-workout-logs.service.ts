import { Injectable } from '@nestjs/common';
import {
	CompleteWorkoutDto,
	CreateExtraLoggedSetDto,
	UpdatePrescribedLoggedSetDto,
} from '../dto/workout-logging.dto';
import { ClientWorkoutFinalizationService } from './client-workout-finalization.service';
import { ClientWorkoutSessionService } from './client-workout-session.service';
import { ClientWorkoutSetLoggingService } from './client-workout-set-logging.service';

export {
	assertLoggingWindow,
	deriveCompletedWorkoutStatus,
} from '../utils/workout-log.utils';

/**
 * Stable controller-facing facade for client workout logging operations.
 * Focused services own their transaction and domain workflow internally.
 */
@Injectable()
export class ClientWorkoutLogsService {
	constructor(
		private readonly sessionService: ClientWorkoutSessionService,
		private readonly setLoggingService: ClientWorkoutSetLoggingService,
		private readonly finalizationService: ClientWorkoutFinalizationService,
	) {}

	async startOrResumeWorkout(
		clientId: string,
		tenantId: string | null,
		programDayId: string,
	) {
		return this.sessionService.startOrResumeWorkout(
			clientId,
			tenantId,
			programDayId,
		);
	}

	async getWorkoutLog(
		clientId: string,
		tenantId: string | null,
		logId: string,
	) {
		return this.sessionService.getWorkoutLog(clientId, tenantId, logId);
	}

	async updatePrescribedSet(
		clientId: string,
		tenantId: string | null,
		logId: string,
		loggedSetId: string,
		body: UpdatePrescribedLoggedSetDto,
	) {
		return this.setLoggingService.updatePrescribedSet(
			clientId,
			tenantId,
			logId,
			loggedSetId,
			body,
		);
	}

	async addExtraSet(
		clientId: string,
		tenantId: string | null,
		logId: string,
		body: CreateExtraLoggedSetDto,
	) {
		return this.setLoggingService.addExtraSet(clientId, tenantId, logId, body);
	}

	async removeExtraSet(
		clientId: string,
		tenantId: string | null,
		logId: string,
		loggedSetId: string,
	) {
		return this.setLoggingService.removeExtraSet(
			clientId,
			tenantId,
			logId,
			loggedSetId,
		);
	}

	async completeWorkout(
		clientId: string,
		tenantId: string | null,
		logId: string,
		body: CompleteWorkoutDto,
	) {
		return this.finalizationService.completeWorkout(
			clientId,
			tenantId,
			logId,
			body,
		);
	}

	async skipWorkoutDay(
		clientId: string,
		tenantId: string | null,
		programDayId: string,
	) {
		return this.finalizationService.skipWorkoutDay(
			clientId,
			tenantId,
			programDayId,
		);
	}
}
