import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { Exercise } from '../../../exercises/entities/exercise.entity';
import { PrescribeExerciseDto } from '../dto/prescribe-exercise.dto';
import {
	CreateAndPrescribeExerciseDto,
	ReplacePlannedSetsDto,
	UpdatePlannedExerciseDto,
} from '../dto/workout-builder.dto';
import { PlannedExercise } from '../entities/planned-exercise.entity';
import { PlannedSet } from '../entities/planned-set.entity';
import {
	getEditablePlannedExercise,
	insertExerciseSnapshot,
	lockEditableDay,
	rewriteExercisePositions,
} from '../helpers/workout-builder.persistence';
import {
	assertActiveTenant,
	assertWorkoutDay,
	mapPlannedSet,
	normalizeOptionalText,
	validateSetPrescriptions,
} from '../utils/training-service.utils';

@Injectable()
export class PlannedExercisesService {
	constructor(private readonly dataSource: DataSource) {}

	async addExerciseFromLibrary(
		tenantId: string | null,
		programId: string,
		programDayId: string,
		body: PrescribeExerciseDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		return this.dataSource.transaction(async (manager) => {
			const day = await lockEditableDay(
				manager,
				activeTenantId,
				programId,
				programDayId,
			);
			assertWorkoutDay(day);

			const exercise = await manager.getRepository(Exercise).findOne({
				where: {
					id: body.exerciseId,
					tenantId: activeTenantId,
					isActive: true,
				},
			});
			if (!exercise) {
				throw new NotFoundException('Active library exercise not found');
			}

			return insertExerciseSnapshot(manager, day, exercise, body);
		});
	}

	async createLibraryExerciseAndAdd(
		tenantId: string | null,
		coachId: string,
		programId: string,
		programDayId: string,
		body: CreateAndPrescribeExerciseDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		return this.dataSource.transaction(async (manager) => {
			const day = await lockEditableDay(
				manager,
				activeTenantId,
				programId,
				programDayId,
			);
			assertWorkoutDay(day);

			const exerciseRepository = manager.getRepository(Exercise);
			const duplicate = await exerciseRepository
				.createQueryBuilder('exercise')
				.where('exercise.tenant_id = :tenantId', { tenantId: activeTenantId })
				.andWhere('LOWER(exercise.name) = LOWER(:name)', {
					name: body.exercise.name.trim(),
				})
				.getOne();
			if (duplicate) {
				throw new ConflictException('Exercise with this name already exists');
			}

			let exercise: Exercise;
			try {
				exercise = await exerciseRepository.save(
					exerciseRepository.create({
						tenantId: activeTenantId,
						createdBy: { id: coachId },
						sourceSeed: null,
						name: body.exercise.name.trim(),
						category: body.exercise.category,
						primaryMuscle: body.exercise.primaryMuscle,
						secondaryMuscles: body.exercise.secondaryMuscles ?? [],
						equipment: body.exercise.equipment ?? [],
						demoVideoUrl: body.exercise.demoVideoUrl ?? null,
						demoGifUrl: body.exercise.demoGifUrl ?? null,
						thumbnailUrl: body.exercise.thumbnailUrl ?? null,
						instructionSteps: body.exercise.instructionSteps,
						isActive: true,
					}),
				);
			} catch (error) {
				if (
					error instanceof QueryFailedError &&
					(error.driverError as { code?: string } | undefined)?.code === '23505'
				) {
					throw new ConflictException('Exercise with this name already exists');
				}
				throw error;
			}

			const plannedExercise = await insertExerciseSnapshot(
				manager,
				day,
				exercise,
				body.prescription,
			);
			return { exercise, plannedExercise };
		});
	}

	async updatePlannedExercise(
		tenantId: string | null,
		programId: string,
		plannedExerciseId: string,
		body: UpdatePlannedExerciseDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		return this.dataSource.transaction(async (manager) => {
			const planned = await getEditablePlannedExercise(
				manager,
				activeTenantId,
				programId,
				plannedExerciseId,
			);
			const repository = manager.getRepository(PlannedExercise);

			if (body.position !== undefined && body.position !== planned.position) {
				const ordered = await repository.find({
					where: { programDayId: planned.programDayId },
					order: { position: 'ASC' },
				});
				if (body.position > ordered.length) {
					throw new BadRequestException(
						`position must be between 1 and ${ordered.length}`,
					);
				}
				const withoutCurrent = ordered.filter((item) => item.id !== planned.id);
				withoutCurrent.splice(body.position - 1, 0, planned);
				await rewriteExercisePositions(manager, ordered, withoutCurrent);
				planned.position = body.position;
			}

			if (body.supersetGroup !== undefined)
				planned.supersetGroup = body.supersetGroup;
			if (body.restSeconds !== undefined)
				planned.restSeconds = body.restSeconds;
			if (body.tempo !== undefined) planned.tempo = body.tempo;
			if (body.coachNotes !== undefined)
				planned.coachNotes = normalizeOptionalText(body.coachNotes);

			await repository.save(planned);
			return repository.findOne({
				where: { id: planned.id },
				relations: { sets: true },
				order: { sets: { setNumber: 'ASC' } },
			});
		});
	}

	async replacePlannedSets(
		tenantId: string | null,
		programId: string,
		plannedExerciseId: string,
		body: ReplacePlannedSetsDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		return this.dataSource.transaction(async (manager) => {
			const planned = await getEditablePlannedExercise(
				manager,
				activeTenantId,
				programId,
				plannedExerciseId,
			);
			validateSetPrescriptions(body.sets);

			const setRepository = manager.getRepository(PlannedSet);
			await setRepository.delete({ plannedExerciseId: planned.id });
			const sets = body.sets.map((set, index) =>
				setRepository.create({
					plannedExerciseId: planned.id,
					plannedExercise: { id: planned.id },
					...mapPlannedSet(set, index + 1),
				}),
			);
			return setRepository.save(sets);
		});
	}

	async deletePlannedExercise(
		tenantId: string | null,
		programId: string,
		plannedExerciseId: string,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		return this.dataSource.transaction(async (manager) => {
			const planned = await getEditablePlannedExercise(
				manager,
				activeTenantId,
				programId,
				plannedExerciseId,
			);
			const repository = manager.getRepository(PlannedExercise);
			const ordered = await repository.find({
				where: { programDayId: planned.programDayId },
				order: { position: 'ASC' },
			});
			await repository.delete(planned.id);
			const remaining = ordered.filter((item) => item.id !== planned.id);
			await rewriteExercisePositions(manager, remaining, remaining);
			return { message: 'Planned exercise deleted' };
		});
	}
}
