import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
		@InjectRepository(DefaultExercise)
		private readonly defaultExerciseRepo: Repository<DefaultExercise>,
	) {}

	async initializeCoachLibrary(tenantId: string) {
		if (!tenantId) {
			throw new BadRequestException(
				'No Active Tenant Was Provided, Please Try again',
			);
		}

		const checkDefaultExercises = await this.defaultExerciseRepo.find({
			where: {
				isActive: true,
			},
		});

		if (checkDefaultExercises.length == 0) {
			throw new NotFoundException(
				'No Default Exercises were Found, Please Contact The Support or fill you library manually',
			);
		}

		const tenantExercises = await this.exerciseRepo.find({
			where: { tenantId },
			relations: { sourceSeed: true },
		});

		const defaultExerciseIdsSet: Set<string> = new Set<string>();
		const usedExerciseNamesSet: Set<string> = new Set<string>();
		const exercisesToCreate: Exercise[] = [];
		let skipped = 0;
		let created = 0;

		tenantExercises.forEach((tenantExercise) => {
			usedExerciseNamesSet.add(this.normalizeExerciseName(tenantExercise.name));

			if (tenantExercise.sourceSeed) {
				defaultExerciseIdsSet.add(tenantExercise.sourceSeed.id);
			}
		});

		checkDefaultExercises.forEach((exercise) => {
			if (defaultExerciseIdsSet.has(exercise.id)) {
				skipped++;
			} else if (
				usedExerciseNamesSet.has(this.normalizeExerciseName(exercise.name))
			) {
				skipped++;
			} else {
				const newExercise = this.exerciseRepo.create({
					tenantId,
					sourceSeed: exercise,
					createdBy: null,
					name: exercise.name,
					category: exercise.category,
					primaryMuscle: exercise.primaryMuscle,
					secondaryMuscles: exercise.secondaryMuscles,
					equipment: exercise.equipment,
					demoVideoUrl: exercise.demoVideoUrl,
					demoGifUrl: exercise.demoGifUrl,
					thumbnailUrl: exercise.thumbnailUrl,
					instructionSteps: exercise.instructionSteps,
					isActive: true,
				});
				exercisesToCreate.push(newExercise);
			}
		});

		await this.exerciseRepo.save(exercisesToCreate);
		created = exercisesToCreate.length;
		return {
			created,
			skipped,
		};
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
