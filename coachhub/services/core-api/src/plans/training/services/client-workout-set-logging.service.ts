import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
	CreateExtraLoggedSetDto,
	UpdatePrescribedLoggedSetDto,
} from '../dto/workout-logging.dto';
import { LoggedExercise } from '../entities/logged-exercise.entity';
import { LoggedSet } from '../entities/logged-set.entity';
import {
	getActiveMembership,
	lockOwnedInProgressLog,
} from '../helpers/workout-log.persistence';
import { assertActiveTenant } from '../utils/training-service.utils';
import {
	EXTRA_SET_OUTCOMES,
	resolveActualValues,
	SUBMITTED_SET_OUTCOMES,
} from '../utils/workout-log.utils';

@Injectable()
export class ClientWorkoutSetLoggingService {
	constructor(private readonly dataSource: DataSource) {}

	async updatePrescribedSet(
		clientId: string,
		tenantId: string | null,
		logId: string,
		loggedSetId: string,
		body: UpdatePrescribedLoggedSetDto,
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
			const repository = manager.getRepository(LoggedSet);
			const loggedSet = await repository.findOne({
				where: {
					id: loggedSetId,
					isExtra: false,
					loggedExercise: { loggedWorkoutId: log.id },
				},
			});
			if (!loggedSet) {
				throw new NotFoundException('Prescribed logged set not found');
			}

			const actuals = resolveActualValues(
				body,
				loggedSet,
				SUBMITTED_SET_OUTCOMES,
			);
			Object.assign(loggedSet, actuals, { outcome: body.outcome });
			return repository.save(loggedSet);
		});
	}

	/**
	 * V1 intentionally accepts an existing loggedExerciseId, never a replacement
	 * exerciseId. Exercise substitution needs a future explicit, audited workflow.
	 */
	async addExtraSet(
		clientId: string,
		tenantId: string | null,
		logId: string,
		body: CreateExtraLoggedSetDto,
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
			const loggedExercise = await manager
				.getRepository(LoggedExercise)
				.findOne({
					where: {
						id: body.loggedExerciseId,
						loggedWorkoutId: log.id,
					},
				});
			if (!loggedExercise) {
				throw new NotFoundException('Logged prescribed exercise not found');
			}

			const actuals = resolveActualValues(body, undefined, EXTRA_SET_OUTCOMES);
			const repository = manager.getRepository(LoggedSet);
			const lastSet = await repository.findOne({
				where: { loggedExerciseId: loggedExercise.id },
				order: { setNumber: 'DESC' },
			});

			return repository.save(
				repository.create({
					loggedExerciseId: loggedExercise.id,
					plannedSetId: null,
					setNumber: (lastSet?.setNumber ?? 0) + 1,
					isExtra: true,
					prescribedSetType: null,
					prescribedRepsMin: null,
					prescribedRepsMax: null,
					prescribedDurationSeconds: null,
					prescribedWeightKg: null,
					prescribedIntensityType: null,
					prescribedIntensityValue: null,
					...actuals,
					outcome: body.outcome,
				}),
			);
		});
	}

	async removeExtraSet(
		clientId: string,
		tenantId: string | null,
		logId: string,
		loggedSetId: string,
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
			const repository = manager.getRepository(LoggedSet);
			const extraSet = await repository.findOne({
				where: {
					id: loggedSetId,
					isExtra: true,
					loggedExercise: { loggedWorkoutId: log.id },
				},
			});
			if (!extraSet) {
				throw new NotFoundException('Extra logged set not found');
			}

			await repository.remove(extraSet);
			return { id: loggedSetId, message: 'Extra set removed' };
		});
	}
}
