import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProgramType, SessionStatus, SetOutcome } from '../../../common';
import { LoggedExercise } from '../entities/logged-exercise.entity';
import { LoggedSet } from '../entities/logged-set.entity';
import { LoggedWorkout } from '../entities/logged-workout.entity';
import { PlannedExercise } from '../entities/planned-exercise.entity';
import { ProgramDay } from '../entities/program-day.entity';
import {
	getDateOnlyInTimeZone,
	getScheduledDate,
} from '../utils/program-date.utils';
import {
	assertCompletePrescription,
	assertLoggableLifecycle,
	assertLoggingWindow,
} from '../utils/workout-log.utils';
import { getActiveMembership } from './workout-log.persistence';

/**
 * Starts the canonical log for a program day or resumes the existing one. It
 * locks the owned day, validates the logging window, snapshots the prescription
 * once, and always returns the same fully loaded workout graph.
 */
export async function getOrCreateInProgressWorkout(
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

/**
 * Confirms that the day belongs to the client's tenant membership and locks it
 * for the transaction. This serializes competing start requests before either
 * request checks for or creates the one canonical workout log.
 */
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

/**
 * Creates the historical workout, exercise, and set snapshot from the current
 * prescription. Planned identifiers are retained for lineage, while actual
 * performance starts empty and each prescribed set starts pending.
 */
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

/**
 * Loads the one log associated with a program day together with exercises and
 * ordered sets. Both create and resume use this loader so their response shape
 * and ordering stay identical.
 */
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
