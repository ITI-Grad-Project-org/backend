import {
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
import { assertActiveTenant } from '../utils/training-service.utils';

@Injectable()
export class ClientWorkoutLogsService {
	constructor(private readonly dataSource: DataSource) {}

	async startOrResumeWorkout(
		clientId: string,
		tenantId: string | null,
		programDayId: string,
	) {
		const activeTenantId = assertActiveTenant(tenantId);

		return this.dataSource.transaction(async (manager) => {
			const membership = await getActiveMembership(
				manager,
				clientId,
				activeTenantId,
			);
			const day = await lockOwnedProgramDay(
				manager,
				activeTenantId,
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
			const today = getDateOnlyInTimeZone(
				new Date(),
				membership.tenant.timezone,
			);
			assertLoggingWindow(scheduledDate, today, program.endDate);

			const existing = await loadCanonicalLog(
				manager,
				activeTenantId,
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

			const plannedExercises = await manager
				.getRepository(PlannedExercise)
				.find({
					where: { tenantId: activeTenantId, programDayId: day.id },
					relations: { sets: true },
					order: { position: 'ASC', sets: { setNumber: 'ASC' } },
				});
			assertCompletePrescription(plannedExercises);

			await createWorkoutSnapshot(
				manager,
				activeTenantId,
				membership.id,
				program.id,
				day.id,
				scheduledDate,
				plannedExercises,
			);

			const created = await loadCanonicalLog(
				manager,
				activeTenantId,
				membership.id,
				program.id,
				day.id,
			);
			if (!created) {
				throw new NotFoundException('Created workout log could not be loaded');
			}
			return created;
		});
	}
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
