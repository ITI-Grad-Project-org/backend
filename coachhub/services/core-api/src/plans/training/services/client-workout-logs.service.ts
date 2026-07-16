import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import {
	MembershipStatus,
	ProgramStatus,
	ProgramType,
	SessionStatus,
	SetOutcome,
} from '../../../common';
import {
	CompleteWorkoutDto,
	CreateExtraLoggedSetDto,
	UpdatePrescribedLoggedSetDto,
} from '../dto/workout-logging.dto';
import { LoggedExercise } from '../entities/logged-exercise.entity';
import { LoggedSet } from '../entities/logged-set.entity';
import { LoggedWorkout } from '../entities/logged-workout.entity';
import { PlannedExercise } from '../entities/planned-exercise.entity';
import { ProgramDay } from '../entities/program-day.entity';
import { Program } from '../entities/program.entity';
import {
	addDaysToDateOnly,
	getDateOnlyInTimeZone,
	getScheduledDate,
} from '../utils/program-date.utils';
import {
	assertActiveTenant,
	normalizeOptionalText,
} from '../utils/training-service.utils';

@Injectable()
export class ClientWorkoutLogsService {
	constructor(private readonly dataSource: DataSource) {}

	async startOrResumeWorkout(
		clientId: string,
		tenantId: string | null,
		programDayId: string,
	) {
		const activeTenantId = assertActiveTenant(tenantId);

		return this.dataSource.transaction((manager) =>
			getOrCreateInProgressWorkout(
				manager,
				clientId,
				activeTenantId,
				programDayId,
			),
		);
	}

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

	async getWorkoutLog(
		clientId: string,
		tenantId: string | null,
		logId: string,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		const manager = this.dataSource.manager;
		const membership = await getActiveMembership(
			manager,
			clientId,
			activeTenantId,
		);
		const log = await loadOwnedWorkoutLog(
			manager,
			activeTenantId,
			membership.id,
			logId,
		);
		if (!log) {
			throw new NotFoundException('Workout log not found');
		}
		return log;
	}

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
			if (prescribedSets.length === 0) {
				throw new ConflictException('Workout log has no prescribed sets');
			}
			for (const set of prescribedSets) {
				Object.assign(set, emptyActualValues(), {
					outcome: SetOutcome.SKIPPED,
				});
			}
			await manager.getRepository(LoggedSet).save(prescribedSets);

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

const SUBMITTED_SET_OUTCOMES = [
	SetOutcome.COMPLETED,
	SetOutcome.PARTIAL,
	SetOutcome.SKIPPED,
];
const EXTRA_SET_OUTCOMES = [SetOutcome.COMPLETED, SetOutcome.PARTIAL];

type ActualSetInput = {
	outcome: SetOutcome;
	reps?: number | null;
	weightKg?: number | null;
	durationSeconds?: number | null;
	rpe?: number | null;
};

type ActualSetValues = {
	reps: number | null;
	weightKg: number | null;
	durationSeconds: number | null;
	rpe: number | null;
};

async function getOrCreateInProgressWorkout(
	manager: EntityManager,
	clientId: string,
	tenantId: string,
	programDayId: string,
) {
	const membership = await getActiveMembership(manager, clientId, tenantId);
	const day = await lockOwnedProgramDay(
		manager,
		tenantId,
		membership.id,
		programDayId,
	);
	const program = day.programWeek.program;
	assertLoggableLifecycle(program, day);

	const scheduledDate = getScheduledDate(
		program.startDate as string,
		day.programWeek.weekNumber,
		day.dayNumber,
	);
	const today = getDateOnlyInTimeZone(new Date(), membership.tenant.timezone);
	assertLoggingWindow(scheduledDate, today, program.endDate);

	const existing = await loadCanonicalLog(
		manager,
		tenantId,
		membership.id,
		program.id,
		day.id,
	);
	if (existing) {
		if (existing.status !== SessionStatus.IN_PROGRESS) {
			throw new ConflictException(
				'This program day already has a finalized workout log',
			);
		}
		return existing;
	}

	const plannedExercises = await manager.getRepository(PlannedExercise).find({
		where: { tenantId, programDayId: day.id },
		relations: { sets: true },
		order: { position: 'ASC', sets: { setNumber: 'ASC' } },
	});
	assertCompletePrescription(plannedExercises);

	await createWorkoutSnapshot(
		manager,
		tenantId,
		membership.id,
		program.id,
		day.id,
		scheduledDate,
		plannedExercises,
	);

	const created = await loadCanonicalLog(
		manager,
		tenantId,
		membership.id,
		program.id,
		day.id,
	);
	if (!created) {
		throw new NotFoundException('Created workout log could not be loaded');
	}
	return created;
}

export function deriveCompletedWorkoutStatus(outcomes: SetOutcome[]) {
	if (outcomes.length === 0) {
		throw new ConflictException('Workout log has no prescribed sets');
	}
	if (outcomes.some((outcome) => outcome === SetOutcome.PENDING)) {
		throw new ConflictException(
			'Every prescribed set needs a final outcome before completion',
		);
	}
	if (outcomes.every((outcome) => outcome === SetOutcome.COMPLETED)) {
		return SessionStatus.COMPLETED;
	}
	if (outcomes.every((outcome) => outcome === SetOutcome.SKIPPED)) {
		return SessionStatus.SKIPPED;
	}
	return SessionStatus.PARTIAL;
}

async function getActiveMembership(
	manager: EntityManager,
	clientId: string,
	tenantId: string,
) {
	const membership = await manager.getRepository(ClientMembership).findOne({
		where: {
			tenant: { id: tenantId },
			client: { id: clientId },
			status: MembershipStatus.ACTIVE,
		},
		relations: { tenant: true },
	});
	if (!membership) {
		throw new NotFoundException('Active client membership not found');
	}
	return membership;
}

async function lockOwnedInProgressLog(
	manager: EntityManager,
	tenantId: string,
	membershipId: string,
	logId: string,
) {
	const log = await manager
		.getRepository(LoggedWorkout)
		.createQueryBuilder('log')
		.where('log.id = :logId', { logId })
		.andWhere('log.tenant_id = :tenantId', { tenantId })
		.andWhere('log.membership_id = :membershipId', { membershipId })
		.setLock('pessimistic_write')
		.getOne();
	if (!log) {
		throw new NotFoundException('Workout log not found');
	}
	if (log.status !== SessionStatus.IN_PROGRESS) {
		throw new ConflictException('Finalized workout logs are immutable');
	}
	return log;
}

function loadPrescribedLoggedSets(manager: EntityManager, logId: string) {
	return manager.getRepository(LoggedSet).find({
		where: {
			isExtra: false,
			loggedExercise: { loggedWorkoutId: logId },
		},
		order: { loggedExerciseId: 'ASC', setNumber: 'ASC' },
	});
}

function loadOwnedWorkoutLog(
	manager: EntityManager,
	tenantId: string,
	membershipId: string,
	logId: string,
) {
	return manager.getRepository(LoggedWorkout).findOne({
		where: { id: logId, tenantId, membershipId },
		relations: { exercises: { sets: true } },
		order: {
			exercises: {
				position: 'ASC',
				sets: { setNumber: 'ASC' },
			},
		},
	});
}

function resolveActualValues(
	input: ActualSetInput,
	current: ActualSetValues | undefined,
	allowedOutcomes: SetOutcome[],
): ActualSetValues {
	if (!allowedOutcomes.includes(input.outcome)) {
		throw new BadRequestException('Invalid submitted set outcome');
	}

	if (input.outcome === SetOutcome.SKIPPED) {
		if (hasAnySubmittedActual(input)) {
			throw new BadRequestException(
				'Skipped sets cannot contain actual performance values',
			);
		}
		return emptyActualValues();
	}

	const actuals = {
		reps: input.reps === undefined ? (current?.reps ?? null) : input.reps,
		weightKg:
			input.weightKg === undefined
				? (current?.weightKg ?? null)
				: input.weightKg,
		durationSeconds:
			input.durationSeconds === undefined
				? (current?.durationSeconds ?? null)
				: input.durationSeconds,
		rpe: input.rpe === undefined ? (current?.rpe ?? null) : input.rpe,
	};
	if (!Object.values(actuals).some((value) => value !== null)) {
		throw new BadRequestException(
			'Completed and partial sets require actual performance data',
		);
	}
	return actuals;
}

function hasAnySubmittedActual(input: ActualSetInput) {
	return [input.reps, input.weightKg, input.durationSeconds, input.rpe].some(
		(value) => value != null,
	);
}

function emptyActualValues(): ActualSetValues {
	return {
		reps: null,
		weightKg: null,
		durationSeconds: null,
		rpe: null,
	};
}

async function lockOwnedProgramDay(
	manager: EntityManager,
	tenantId: string,
	membershipId: string,
	programDayId: string,
) {
	const day = await manager
		.getRepository(ProgramDay)
		.createQueryBuilder('day')
		.innerJoinAndSelect('day.programWeek', 'week')
		.innerJoinAndSelect('week.program', 'program')
		.where('day.id = :programDayId', { programDayId })
		.andWhere('day.tenant_id = :tenantId', { tenantId })
		.andWhere('program.tenant_id = :tenantId', { tenantId })
		.andWhere('program.membership_id = :membershipId', { membershipId })
		.andWhere('program.program_type = :programType', {
			programType: ProgramType.CLIENT,
		})
		.setLock('pessimistic_write')
		.getOne();
	if (!day) {
		throw new NotFoundException('Published client program day not found');
	}
	return day;
}

function assertLoggableLifecycle(program: Program, day: ProgramDay) {
	if (program.status !== ProgramStatus.PUBLISHED) {
		throw new ConflictException(
			'Only published, non-cancelled program days can be logged',
		);
	}
	if (day.isRestDay) {
		throw new ConflictException('Rest days cannot be logged as workouts');
	}
}

export function assertLoggingWindow(
	scheduledDate: string,
	today: string,
	programEndDate: string | null,
) {
	if (!programEndDate || today > programEndDate) {
		throw new ConflictException('Ended programs cannot start workout logs');
	}
	if (scheduledDate > today) {
		throw new ConflictException('Future program days cannot be logged');
	}

	const earliestAllowedDate = addDaysToDateOnly(today, -6);
	if (scheduledDate < earliestAllowedDate) {
		throw new ConflictException(
			'Program days can only be logged within the seven-day backfill window',
		);
	}
}

function assertCompletePrescription(plannedExercises: PlannedExercise[]) {
	if (plannedExercises.length === 0) {
		throw new ConflictException('Workout day has no exercise prescription');
	}
	if (plannedExercises.some((exercise) => exercise.sets.length === 0)) {
		throw new ConflictException(
			'Every prescribed exercise must contain at least one set',
		);
	}
}

async function createWorkoutSnapshot(
	manager: EntityManager,
	tenantId: string,
	membershipId: string,
	programId: string,
	programDayId: string,
	scheduledDate: string,
	plannedExercises: PlannedExercise[],
) {
	const workoutRepository = manager.getRepository(LoggedWorkout);
	const exerciseRepository = manager.getRepository(LoggedExercise);
	const setRepository = manager.getRepository(LoggedSet);

	const workout = await workoutRepository.save(
		workoutRepository.create({
			tenantId,
			membershipId,
			programId,
			programDayId,
			scheduledDate,
			startedAt: new Date(),
			completedAt: null,
			durationMinutes: null,
			status: SessionStatus.IN_PROGRESS,
			clientNotes: null,
			overallRpe: null,
		}),
	);

	const loggedExercises = await exerciseRepository.save(
		plannedExercises.map((planned) =>
			exerciseRepository.create({
				loggedWorkoutId: workout.id,
				plannedExerciseId: planned.id,
				exerciseId: planned.exerciseId,
				exerciseName: planned.exerciseName,
				position: planned.position,
			}),
		),
	);

	await setRepository.save(
		plannedExercises.flatMap((planned, exerciseIndex) =>
			planned.sets.map((set) =>
				setRepository.create({
					loggedExerciseId: loggedExercises[exerciseIndex].id,
					plannedSetId: set.id,
					setNumber: set.setNumber,
					isExtra: false,
					prescribedSetType: set.setType,
					prescribedRepsMin: set.repsMin,
					prescribedRepsMax: set.repsMax,
					prescribedDurationSeconds: set.durationSeconds,
					prescribedWeightKg: set.weightKg,
					prescribedIntensityType: set.intensityType,
					prescribedIntensityValue: set.intensityValue,
					reps: null,
					weightKg: null,
					durationSeconds: null,
					rpe: null,
					outcome: SetOutcome.PENDING,
				}),
			),
		),
	);
}

function loadCanonicalLog(
	manager: EntityManager,
	tenantId: string,
	membershipId: string,
	programId: string,
	programDayId: string,
) {
	return manager.getRepository(LoggedWorkout).findOne({
		where: {
			tenantId,
			membershipId,
			programId,
			programDayId,
		},
		relations: { exercises: { sets: true } },
		order: {
			exercises: {
				position: 'ASC',
				sets: { setNumber: 'ASC' },
			},
		},
	});
}
