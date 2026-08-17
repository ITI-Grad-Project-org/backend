import { ConflictException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import {
	DifficultyLevel,
	FitnessGoal,
	IntensityType,
	ProgramStatus,
	ProgramType,
	SetType,
} from '../../common';
import { deriveInclusiveEndDate } from '../../common/utils/date-only.utils';
import { Exercise } from '../../exercises/entities/exercise.entity';
import { PlannedExercise } from '../../plans/training/entities/planned-exercise.entity';
import { PlannedSet } from '../../plans/training/entities/planned-set.entity';
import { ProgramDay } from '../../plans/training/entities/program-day.entity';
import { ProgramWeek } from '../../plans/training/entities/program-week.entity';
import { Program } from '../../plans/training/entities/program.entity';
import { TRAINING_VALIDATION_LIMITS } from '../../plans/training/utils/training-validation.constants';
import {
	readArray,
	readBoolean,
	readEnum,
	readInt,
	readNumber,
	readRecord,
	readString,
	renumber,
} from '../utils/plan-json.utils';
import { StalePlanReferencesError } from './stale-plan-references.error';

export interface BuildProgramInput {
	tenantId: string;
	coachId: string;
	membershipId: string;
	plan: Record<string, unknown>;
	durationWeeks: number;
	goal: FitnessGoal | null;
	startDate: string;
	/** Overrides the name the model chose. */
	nameOverride: string | null;
}

interface PlannedDay {
	dayNumber: number;
	name: string | null;
	isRestDay: boolean;
	notes: string | null;
	exercises: PlannedExerciseInput[];
}

interface PlannedExerciseInput {
	exerciseId: string;
	restSeconds: number;
	tempo: string | null;
	supersetGroup: number | null;
	coachNotes: string | null;
	sets: Partial<PlannedSet>[];
}

/**
 * Turns an accepted suggestion into a real client program.
 *
 * <h2>Why the whole week repeats</h2>
 *
 * The model designs one week and states a progression rule. Expanding that into
 * week 2 onwards is arithmetic only when there is something to do arithmetic on
 * — and there is not: the model is deliberately never asked for a load in
 * kilograms, because nothing in the context says what this client can lift.
 * Inflating the rep range instead would read fine in week 2 and be nonsense by
 * week 12.
 *
 * So the structure repeats and the rule travels with it, on every week's notes,
 * where the coach who is going to apply it will see it. That is a skeleton a
 * coach edits, which is what they were going to do with the loads anyway.
 */
export async function buildProgramFromPlan(
	manager: EntityManager,
	input: BuildProgramInput,
): Promise<Program> {
	const days = readTrainingDays(input.plan);
	await assertExercisesStillExist(manager, input.tenantId, days);

	const progressionNote = readProgressionNote(input.plan);
	const programRepository = manager.getRepository(Program);
	const weekRepository = manager.getRepository(ProgramWeek);
	const dayRepository = manager.getRepository(ProgramDay);

	// Program → weeks → days cascade on insert; exercises do not, so they follow
	// in a second pass once the days have ids.
	const program = await programRepository.save(
		programRepository.create({
			tenantId: input.tenantId,
			tenant: { id: input.tenantId },
			createdBy: { id: input.coachId },
			programType: ProgramType.CLIENT,
			membershipId: input.membershipId,
			membership: { id: input.membershipId },
			name:
				input.nameOverride ??
				readString(input.plan.name, 150) ??
				'AI training program',
			description: readString(input.plan.description),
			goal: input.goal,
			difficulty: readEnum(
				input.plan.difficulty,
				Object.values(DifficultyLevel),
			),
			durationWeeks: input.durationWeeks,
			startDate: input.startDate,
			endDate: deriveInclusiveEndDate(input.startDate, input.durationWeeks),
			status: ProgramStatus.DRAFT,
			weeks: Array.from({ length: input.durationWeeks }, (_, index) =>
				weekRepository.create({
					tenantId: input.tenantId,
					tenant: { id: input.tenantId },
					weekNumber: index + 1,
					// Week 1 is the baseline; the rule describes the step away from it.
					notes: index === 0 ? null : progressionNote,
					days: days.map((day) =>
						dayRepository.create({
							tenantId: input.tenantId,
							tenant: { id: input.tenantId },
							dayNumber: day.dayNumber,
							name: day.name,
							isRestDay: day.isRestDay,
							notes: day.notes,
						}),
					),
				}),
			),
		}),
	);

	await saveExercises(manager, input.tenantId, program, days);
	return program;
}

async function saveExercises(
	manager: EntityManager,
	tenantId: string,
	program: Program,
	days: PlannedDay[],
) {
	const exerciseRepository = manager.getRepository(PlannedExercise);
	const setRepository = manager.getRepository(PlannedSet);
	const library = await loadLibrary(
		manager,
		tenantId,
		days.flatMap((day) => day.exercises.map((exercise) => exercise.exerciseId)),
	);

	const rows: PlannedExercise[] = [];
	for (const week of program.weeks) {
		for (const storedDay of week.days) {
			const source = days.find((day) => day.dayNumber === storedDay.dayNumber);
			source?.exercises.forEach((planned, index) => {
				const exercise = library.get(planned.exerciseId);
				if (!exercise) {
					return;
				}
				rows.push(
					exerciseRepository.create({
						tenantId,
						tenant: { id: tenantId },
						programDayId: storedDay.id,
						programDay: { id: storedDay.id },
						exerciseId: exercise.id,
						exercise: { id: exercise.id },
						// Denormalised from the library exactly as the manual builder does,
						// so a coach cannot tell an AI-built day from one they dragged
						// together — and so renaming an exercise later does not rewrite
						// history.
						exerciseName: exercise.name,
						category: exercise.category,
						primaryMuscle: exercise.primaryMuscle,
						secondaryMuscles: [...(exercise.secondaryMuscles ?? [])],
						equipment: [...(exercise.equipment ?? [])],
						demoVideoUrl: exercise.demoVideoUrl,
						demoGifUrl: exercise.demoGifUrl,
						thumbnailUrl: exercise.thumbnailUrl,
						instructionSteps: [...(exercise.instructionSteps ?? [])],
						position: index + 1,
						supersetGroup: planned.supersetGroup,
						restSeconds: planned.restSeconds,
						tempo: planned.tempo,
						coachNotes: planned.coachNotes,
						sets: planned.sets.map((set) => setRepository.create(set)),
					}),
				);
			});
		}
	}

	if (rows.length > 0) {
		// Sets cascade from their exercise, so one save writes both levels.
		await exerciseRepository.save(rows);
	}
}

function loadLibrary(manager: EntityManager, tenantId: string, ids: string[]) {
	return manager
		.getRepository(Exercise)
		.find({ where: { tenantId, id: In([...new Set(ids)]) } })
		.then((rows) => new Map(rows.map((row) => [row.id, row])));
}

/**
 * The check the whole feature turns on.
 *
 * `planned_exercises.exercise_id` is NOT NULL with ON DELETE RESTRICT, so an
 * exercise that has gone since the plan was generated cannot be written. The
 * suggestion may have sat for days; a coach archiving a movement in between is
 * ordinary. Naming the ids beats a foreign-key violation from four levels down.
 */
async function assertExercisesStillExist(
	manager: EntityManager,
	tenantId: string,
	days: PlannedDay[],
) {
	const wanted = [
		...new Set(
			days.flatMap((day) =>
				day.exercises.map((exercise) => exercise.exerciseId),
			),
		),
	];
	if (wanted.length === 0) {
		return;
	}

	const found = await manager.getRepository(Exercise).find({
		where: { tenantId, id: In(wanted), isActive: true },
		select: { id: true },
	});
	const alive = new Set(found.map((row) => row.id));
	const missing = wanted.filter((id) => !alive.has(id));

	if (missing.length > 0) {
		throw new StalePlanReferencesError('exercise', missing);
	}
}

function readProgressionNote(plan: Record<string, unknown>): string | null {
	const progression = readRecord(plan.progression);
	return progression ? readString(progression.note) : null;
}

/** Parses and structurally checks the generated week. */
function readTrainingDays(plan: Record<string, unknown>): PlannedDay[] {
	const week = readRecord(plan.week);
	const rawDays = readArray(week?.days);
	if (rawDays.length === 0) {
		throw new ConflictException('The stored plan contains no days');
	}

	const seen = new Set<number>();
	const days: PlannedDay[] = [];

	for (const raw of rawDays) {
		const day = readRecord(raw);
		const dayNumber = readInt(day?.dayNumber);
		if (!day || dayNumber === null || dayNumber < 1 || dayNumber > 7) {
			throw new ConflictException(
				`The stored plan has a day numbered ${dayNumber ?? 'nothing'}; days run 1 to 7`,
			);
		}
		// `program_days` is unique on (week, dayNumber). Catching it here names the
		// day instead of surfacing a constraint name.
		if (seen.has(dayNumber)) {
			throw new ConflictException(`The stored plan repeats day ${dayNumber}`);
		}
		seen.add(dayNumber);

		const isRestDay = readBoolean(day.isRestDay);
		days.push({
			dayNumber,
			name: readString(day.name, 150),
			isRestDay,
			notes: readString(day.notes, TRAINING_VALIDATION_LIMITS.dayNotesLength),
			exercises: isRestDay ? [] : readExercises(day, dayNumber),
		});
	}

	return days;
}

function readExercises(
	day: Record<string, unknown>,
	dayNumber: number,
): PlannedExerciseInput[] {
	const raw = readArray(day.exercises);
	if (raw.length > TRAINING_VALIDATION_LIMITS.exercisesPerDay) {
		throw new ConflictException(
			`Day ${dayNumber} prescribes ${raw.length} exercises; the limit is ${TRAINING_VALIDATION_LIMITS.exercisesPerDay}`,
		);
	}

	return renumber(raw, (item) => readInt(readRecord(item)?.position)).map(
		(item) => {
			const exercise = readRecord(item);
			const exerciseId = readString(exercise?.exerciseId);
			if (!exercise || !exerciseId) {
				throw new ConflictException(
					`Day ${dayNumber} has an exercise with no id`,
				);
			}
			return {
				exerciseId,
				restSeconds: clamp(
					readInt(exercise.restSeconds) ?? 90,
					0,
					TRAINING_VALIDATION_LIMITS.restSeconds,
				),
				tempo: readString(exercise.tempo, 7),
				supersetGroup: readInt(exercise.supersetGroup),
				coachNotes: readString(
					exercise.coachNotes,
					TRAINING_VALIDATION_LIMITS.coachNotesLength,
				),
				sets: readSets(exercise, dayNumber),
			};
		},
	);
}

function readSets(
	exercise: Record<string, unknown>,
	dayNumber: number,
): Partial<PlannedSet>[] {
	const raw = readArray(exercise.sets);
	if (raw.length === 0) {
		throw new ConflictException(
			`Day ${dayNumber} has an exercise with no sets`,
		);
	}
	if (raw.length > TRAINING_VALIDATION_LIMITS.setsPerExercise) {
		throw new ConflictException(
			`Day ${dayNumber} has an exercise with ${raw.length} sets; the limit is ${TRAINING_VALIDATION_LIMITS.setsPerExercise}`,
		);
	}

	return renumber(raw, (item) => readInt(readRecord(item)?.setNumber)).map(
		(item, index) => {
			const set = readRecord(item) ?? {};
			const intensityType = readEnum(
				set.intensityType,
				Object.values(IntensityType),
			);
			const intensityValue = readNumber(set.intensityValue);

			return {
				setNumber: index + 1,
				setType:
					readEnum(set.setType, Object.values(SetType)) ?? SetType.WORKING,
				repsMin: clampOrNull(
					readInt(set.repsMin),
					1,
					TRAINING_VALIDATION_LIMITS.repetitions,
				),
				repsMax: clampOrNull(
					readInt(set.repsMax),
					1,
					TRAINING_VALIDATION_LIMITS.repetitions,
				),
				durationSeconds: clampOrNull(
					readInt(set.durationSeconds),
					1,
					TRAINING_VALIDATION_LIMITS.setDurationSeconds,
				),
				// Never populated from the plan: the model is not asked for a load,
				// because it has no way to know one.
				weightKg: null,
				// ck_planned_sets pairs these two. Half a pair would be rejected, so
				// an incomplete one is dropped rather than half-written.
				intensityType: intensityValue === null ? null : intensityType,
				intensityValue: intensityType === null ? null : intensityValue,
			};
		},
	);
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function clampOrNull(value: number | null, min: number, max: number) {
	return value === null ? null : clamp(value, min, max);
}
