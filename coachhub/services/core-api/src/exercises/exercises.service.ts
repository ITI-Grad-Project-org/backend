import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { QueryExercisesDto } from './dto/query-exercises.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { DefaultExercise } from './entities/default-exercise.entity';
import { Exercise } from './entities/exercise.entity';

@Injectable()
export class ExercisesService {
	constructor(
		@InjectRepository(Exercise)
		private readonly exerciseRepo: Repository<Exercise>,
		private readonly dataSource: DataSource,
	) {}

	async initializeCoachLibrary(tenantId: string) {
		this.assertTenantContext(tenantId);

		return this.dataSource.transaction(async (manager) => {
			const activeDefaultCount = await manager
				.getRepository(DefaultExercise)
				.countBy({ isActive: true });

			if (activeDefaultCount === 0) {
				throw new NotFoundException(
					'No Default Exercises were Found, Please Contact The Support or fill you library manually',
				);
			}

			const createdExercises: Array<{ id: string }> = await manager.query(
				`INSERT INTO exercises
				 (tenant_id, source_seed_id, created_by, name, category,
				  primary_muscle, secondary_muscles, equipment, demo_video_url,
				  demo_gif_url, thumbnail_url, instruction_steps, is_active)
				 SELECT $1,
				        seed.id,
				        NULL,
				        seed.name,
				        seed.category,
				        seed.primary_muscle,
				        seed.secondary_muscles,
				        seed.equipment,
				        seed.demo_video_url,
				        seed.demo_gif_url,
				        seed.thumbnail_url,
				        seed.instruction_steps,
				        TRUE
				 FROM default_exercises seed
				 WHERE seed.is_active
				   AND NOT EXISTS (
				     SELECT 1
				     FROM exercises existing
				     WHERE existing.tenant_id = $1
				       AND (
				         existing.source_seed_id = seed.id
				         OR LOWER(existing.name) = LOWER(seed.name)
				       )
				   )
				 ON CONFLICT (tenant_id, name) DO NOTHING
				 RETURNING id`,
				[tenantId],
			);

			return {
				created: createdExercises.length,
				skipped: activeDefaultCount - createdExercises.length,
			};
		});
	}

	async addExerciseToLibrary(
		tenantId: string,
		coachId: string,
		body: CreateExerciseDto,
	) {
		if (!tenantId) {
			throw new BadRequestException(
				'No Tenant ID was provided, please try again later',
			);
		}

		const checkExerciseDuplication = await this.findByNameCaseInsensitive(
			tenantId,
			body.name,
		);

		if (checkExerciseDuplication) {
			throw new ConflictException('Exercise with this name already Exists');
		}

		const newExercise = this.exerciseRepo.create({
			tenantId,
			createdBy: { id: coachId },
			sourceSeed: null,

			name: body.name.trim(),
			category: body.category,
			primaryMuscle: body.primaryMuscle,
			secondaryMuscles: body.secondaryMuscles ?? [],
			equipment: body.equipment ?? [],

			demoVideoUrl: body.demoVideoUrl ?? null,
			demoGifUrl: body.demoGifUrl ?? null,
			thumbnailUrl: body.thumbnailUrl ?? null,

			instructionSteps: body.instructionSteps,
			isActive: true,
		});
		return await this.exerciseRepo.save(newExercise);
	}

	async getAllLibraryExercises(tenantId: string, query: QueryExercisesDto) {
		this.assertTenantContext(tenantId);

		const exercisesQuery = this.exerciseRepo
			.createQueryBuilder('exercise')
			.where('exercise.tenant_id = :tenantId', { tenantId })
			.orderBy('exercise.name', 'ASC');

		if (!query.includeInactive) {
			exercisesQuery.andWhere('exercise.is_active = true');
		}

		if (query.category) {
			exercisesQuery.andWhere('exercise.category = :category', {
				category: query.category,
			});
		}

		if (query.primaryMuscle) {
			exercisesQuery.andWhere('exercise.primary_muscle = :primaryMuscle', {
				primaryMuscle: query.primaryMuscle,
			});
		}

		if (query.search?.trim()) {
			exercisesQuery.andWhere('exercise.name ILIKE :search', {
				search: `%${query.search.trim()}%`,
			});
		}

		return exercisesQuery.getMany();
	}

	async getLibraryExercise(tenantId: string, exerciseId: string) {
		this.assertTenantContext(tenantId);
		return this.findTenantExerciseOrFail(tenantId, exerciseId);
	}

	async updateLibraryExercise(
		tenantId: string,
		exerciseId: string,
		body: UpdateExerciseDto,
	) {
		this.assertTenantContext(tenantId);
		const exercise = await this.findTenantExerciseOrFail(tenantId, exerciseId);

		if (
			body.name &&
			this.normalizeExerciseName(body.name) !==
				this.normalizeExerciseName(exercise.name)
		) {
			const existingExercise = await this.findByNameCaseInsensitive(
				tenantId,
				body.name,
			);

			if (existingExercise) {
				throw new ConflictException('Exercise with this name already Exists');
			}
		}

		Object.assign(exercise, {
			name: body.name?.trim() ?? exercise.name,
			category: body.category ?? exercise.category,
			primaryMuscle: body.primaryMuscle ?? exercise.primaryMuscle,
			secondaryMuscles: body.secondaryMuscles ?? exercise.secondaryMuscles,
			equipment: body.equipment ?? exercise.equipment,
			demoVideoUrl:
				body.demoVideoUrl !== undefined
					? body.demoVideoUrl
					: exercise.demoVideoUrl,
			demoGifUrl:
				body.demoGifUrl !== undefined ? body.demoGifUrl : exercise.demoGifUrl,
			thumbnailUrl:
				body.thumbnailUrl !== undefined
					? body.thumbnailUrl
					: exercise.thumbnailUrl,
			instructionSteps: body.instructionSteps ?? exercise.instructionSteps,
		});

		return this.exerciseRepo.save(exercise);
	}

	async archiveLibraryExercise(tenantId: string, exerciseId: string) {
		this.assertTenantContext(tenantId);
		const exercise = await this.findTenantExerciseOrFail(tenantId, exerciseId);
		exercise.isActive = false;
		await this.exerciseRepo.save(exercise);
		return { message: 'Exercise archived' };
	}

	async unarchiveLibraryExercise(tenantId: string, exerciseId: string) {
		this.assertTenantContext(tenantId);
		const exercise = await this.findTenantExerciseOrFail(tenantId, exerciseId);
		exercise.isActive = true;
		return this.exerciseRepo.save(exercise);
	}

	private assertTenantContext(tenantId: string) {
		if (!tenantId) {
			throw new BadRequestException(
				'No Tenant ID was provided, please try again later',
			);
		}
	}

	private findByNameCaseInsensitive(tenantId: string, name: string) {
		return this.exerciseRepo
			.createQueryBuilder('exercise')
			.where('exercise.tenant_id = :tenantId', { tenantId })
			.andWhere('LOWER(exercise.name) = LOWER(:name)', { name: name.trim() })
			.getOne();
	}

	private normalizeExerciseName(name: string) {
		return name.trim().toLocaleLowerCase();
	}

	private async findTenantExerciseOrFail(tenantId: string, exerciseId: string) {
		const exercise = await this.exerciseRepo.findOne({
			where: {
				id: exerciseId,
				tenantId,
			},
		});

		if (!exercise) {
			throw new NotFoundException('Exercise not found');
		}

		return exercise;
	}
}
