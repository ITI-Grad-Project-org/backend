import {
	BadRequestException,
	ConflictException,
	NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProgramStatus, ProgramType } from '../../../common';
import { Exercise } from '../../../exercises/entities/exercise.entity';
import { PrescribeExerciseDto } from '../dto/prescribe-exercise.dto';
import { LoggedWorkout } from '../entities/logged-workout.entity';
import { PlannedExercise } from '../entities/planned-exercise.entity';
import { PlannedSet } from '../entities/planned-set.entity';
import { ProgramDay } from '../entities/program-day.entity';
import {
	getDateOnlyInTimeZone,
	getScheduledDate,
} from '../utils/program-date.utils';
import {
	mapPlannedSet,
	normalizeOptionalText,
	validateSetPrescriptions,
} from '../utils/training-service.utils';
import { TRAINING_VALIDATION_LIMITS } from '../utils/training-validation.constants';

/**
 * Validates that a day belongs to the tenant's editable client program, then
 * locks that day so concurrent builder requests cannot corrupt its ordering.
 * Published days remain editable only while they are not past and have no log.
 */
export async function lockEditableDay(
	manager: EntityManager,
	tenantId: string,
	programId: string,
	programDayId: string,
) {
	const day = await manager
		.getRepository(ProgramDay)
		.createQueryBuilder('day')
		.innerJoinAndSelect('day.programWeek', 'week')
		.innerJoinAndSelect('week.program', 'program')
		.innerJoinAndSelect('program.tenant', 'tenant')
		.where('day.id = :programDayId', { programDayId })
		.andWhere('day.tenant_id = :tenantId', { tenantId })
		.andWhere('program.id = :programId', { programId })
		.andWhere('program.tenant_id = :tenantId', { tenantId })
		.andWhere('program.program_type = :programType', {
			programType: ProgramType.CLIENT,
		})
		.andWhere('program.status IN (:...statuses)', {
			statuses: [ProgramStatus.DRAFT, ProgramStatus.PUBLISHED],
		})
		.setLock('pessimistic_write')
		.getOne();
	if (!day) {
		throw new NotFoundException('Editable program day not found');
	}

	const program = day.programWeek.program;
	if (program.status === ProgramStatus.PUBLISHED) {
		const scheduledDate = getScheduledDate(
			program.startDate as string,
			day.programWeek.weekNumber,
			day.dayNumber,
		);
		const today = getDateOnlyInTimeZone(new Date(), program.tenant.timezone);
		if (scheduledDate < today) {
			throw new ConflictException(
				'Past published program days cannot be edited',
			);
		}

		const hasWorkoutLog = await manager
			.getRepository(LoggedWorkout)
			.createQueryBuilder('log')
			.where('log.program_day_id = :programDayId', { programDayId: day.id })
			.andWhere('log.tenant_id = :tenantId', { tenantId })
			.getExists();
		if (hasWorkoutLog) {
			throw new ConflictException(
				'Published program day cannot be edited after workout logging has started',
			);
		}
	}
	return day;
}

/**
 * Peeks at an exercise to discover its parent day, locks that day, then reads
 * the exercise again. The second read closes the gap where it could change
 * between the initial lookup and acquiring the parent lock.
 */
export async function getEditablePlannedExercise(
	manager: EntityManager,
	tenantId: string,
	programId: string,
	plannedExerciseId: string,
) {
	const repository = manager.getRepository(PlannedExercise);
	const candidate = await repository.findOne({
		where: { id: plannedExerciseId, tenantId },
	});
	if (!candidate) {
		throw new NotFoundException('Planned exercise not found');
	}

	await lockEditableDay(manager, tenantId, programId, candidate.programDayId);

	const planned = await repository.findOne({
		where: {
			id: plannedExerciseId,
			tenantId,
			programDayId: candidate.programDayId,
		},
	});
	if (!planned) {
		throw new NotFoundException('Planned exercise not found');
	}
	return planned;
}

/**
 * Copies a library exercise and its prescribed sets into a program day at the
 * requested position. Existing positions are moved temporarily to negatives
 * so the database's unique position constraint is never violated mid-update.
 */
export async function insertExerciseSnapshot(
	manager: EntityManager,
	day: ProgramDay,
	exercise: Exercise,
	body: Omit<PrescribeExerciseDto, 'exerciseId'>,
) {
	validateSetPrescriptions(body.sets);
	const repository = manager.getRepository(PlannedExercise);
	const existing = await repository.find({
		where: { programDayId: day.id },
		order: { position: 'ASC' },
	});
	if (existing.length >= TRAINING_VALIDATION_LIMITS.exercisesPerDay) {
		throw new BadRequestException(
			`A workout day cannot contain more than ${TRAINING_VALIDATION_LIMITS.exercisesPerDay} exercises`,
		);
	}
	const position = body.position ?? existing.length + 1;
	if (position < 1 || position > existing.length + 1) {
		throw new BadRequestException(
			`position must be between 1 and ${existing.length + 1}`,
		);
	}

	for (let index = 0; index < existing.length; index++) {
		await repository.update(existing[index].id, { position: -(index + 1) });
	}

	const setRepository = manager.getRepository(PlannedSet);
	const planned = await repository.save(
		repository.create({
			tenantId: day.tenantId,
			programDayId: day.id,
			programDay: { id: day.id },
			exerciseId: exercise.id,
			exercise: { id: exercise.id },
			exerciseName: exercise.name,
			category: exercise.category,
			primaryMuscle: exercise.primaryMuscle,
			secondaryMuscles: [...exercise.secondaryMuscles],
			equipment: [...exercise.equipment],
			demoVideoUrl: exercise.demoVideoUrl,
			demoGifUrl: exercise.demoGifUrl,
			thumbnailUrl: exercise.thumbnailUrl,
			instructionSteps: [...exercise.instructionSteps],
			position,
			supersetGroup: body.supersetGroup ?? null,
			restSeconds: body.restSeconds ?? 90,
			tempo: body.tempo ?? null,
			coachNotes: normalizeOptionalText(body.coachNotes),
			sets: body.sets.map((set, index) =>
				setRepository.create(mapPlannedSet(set, index + 1)),
			),
		}),
	);

	const finalOrder = [...existing];
	finalOrder.splice(position - 1, 0, planned);
	for (let index = 0; index < finalOrder.length; index++) {
		if (finalOrder[index].id !== planned.id) {
			await repository.update(finalOrder[index].id, { position: index + 1 });
		}
	}
	return planned;
}

/**
 * Rewrites a day's exercise positions into one contiguous order. The negative
 * first pass frees every positive position before the final order is applied,
 * which makes reordering safe under the unique day-position constraint.
 */
export async function rewriteExercisePositions(
	manager: EntityManager,
	currentlyStored: PlannedExercise[],
	desiredOrder: PlannedExercise[],
) {
	const repository = manager.getRepository(PlannedExercise);
	for (let index = 0; index < currentlyStored.length; index++) {
		await repository.update(currentlyStored[index].id, {
			position: -(index + 1),
		});
	}
	for (let index = 0; index < desiredOrder.length; index++) {
		await repository.update(desiredOrder[index].id, { position: index + 1 });
		desiredOrder[index].position = index + 1;
	}
}
