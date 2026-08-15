import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActivityRecorderService } from '../../../activity/services/activity-recorder.service';
import { ActivityType } from '../../../activity/enums/activity-type.enum';
import { buildLoggedSetActivitySourceKey } from '../../../activity/utils/activity-source-key.utils';
import { SessionStatus, SetOutcome } from '../../../common';
import { CompleteWorkoutDto } from '../dto/workout-logging.dto';
import { LoggedSet } from '../entities/logged-set.entity';
import { LoggedWorkout } from '../entities/logged-workout.entity';
import {
	getActiveMembership,
	loadOwnedWorkoutLog,
	loadPrescribedLoggedSets,
	loadWorkoutLoggedSetIds,
	lockOwnedInProgressLog,
} from '../helpers/workout-log.persistence';
import { getOrCreateInProgressWorkout } from '../helpers/workout-log-snapshot.persistence';
import {
	assertActiveTenant,
	normalizeOptionalText,
} from '../utils/training-service.utils';
import {
	deriveCompletedWorkoutStatus,
	emptyActualValues,
} from '../utils/workout-log.utils';

@Injectable()
export class ClientWorkoutFinalizationService {
	constructor(
		private readonly dataSource: DataSource,
		private readonly activityRecorder: ActivityRecorderService,
	) {}

	async completeWorkout(
		clientId: string,
		tenantId: string | null,
		logId: string,
		body: CompleteWorkoutDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);

		return this.dataSource.transaction(async (manager) => {
			const membership = await getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const log = await lockOwnedInProgressLog(
				manager,
				activeTenantId,
				membership.id,
				logId,
			);
			const prescribedSets = await loadPrescribedLoggedSets(manager, log.id);
			const status = deriveCompletedWorkoutStatus(
				prescribedSets.map((set) => set.outcome),
			);

			log.status = status;
			log.completedAt = new Date();
			log.durationMinutes = body.durationMinutes ?? log.durationMinutes;
			log.clientNotes =
				body.clientNotes === undefined
					? log.clientNotes
					: normalizeOptionalText(body.clientNotes);
			log.overallRpe = body.overallRpe ?? log.overallRpe;
			await manager.getRepository(LoggedWorkout).save(log);

			const completed = await loadOwnedWorkoutLog(
				manager,
				activeTenantId,
				membership.id,
				log.id,
			);
			if (!completed) {
				throw new NotFoundException(
					'Completed workout log could not be loaded',
				);
			}
			return completed;
		});
	}

	async skipWorkoutDay(
		clientId: string,
		tenantId: string | null,
		programDayId: string,
	) {
		const activeTenantId = assertActiveTenant(tenantId);

		return this.dataSource.transaction(async (manager) => {
			const log = await getOrCreateInProgressWorkout(
				manager,
				clientId,
				activeTenantId,
				programDayId,
			);
			const lockedLog = await lockOwnedInProgressLog(
				manager,
				activeTenantId,
				log.membershipId,
				log.id,
			);
			const prescribedSets = await loadPrescribedLoggedSets(
				manager,
				lockedLog.id,
			);
			const loggedSetIds = await loadWorkoutLoggedSetIds(manager, lockedLog.id);
			if (prescribedSets.length === 0) {
				throw new ConflictException('Workout log has no prescribed sets');
			}
			for (const set of prescribedSets) {
				Object.assign(set, emptyActualValues(), {
					outcome: SetOutcome.SKIPPED,
				});
			}
			await manager.getRepository(LoggedSet).save(prescribedSets);
			await this.activityRecorder.removeMany(
				manager,
				clientId,
				ActivityType.WORKOUT_SET_REPORTED,
				loggedSetIds.map(buildLoggedSetActivitySourceKey),
			);

			lockedLog.status = SessionStatus.SKIPPED;
			lockedLog.completedAt = new Date();
			await manager.getRepository(LoggedWorkout).save(lockedLog);

			const skipped = await loadOwnedWorkoutLog(
				manager,
				activeTenantId,
				lockedLog.membershipId,
				lockedLog.id,
			);
			if (!skipped) {
				throw new NotFoundException('Skipped workout log could not be loaded');
			}
			return skipped;
		});
	}
}
