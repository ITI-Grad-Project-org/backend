import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { IntensityType, SetType } from '../../common';
import { Exercise } from '../../exercises/entities/exercise.entity';
import { PlannedExercise } from '../../plans/training/entities/planned-exercise.entity';
import { Program } from '../../plans/training/entities/program.entity';
import { buildProgramFromPlan } from './training-program.persistence';
import { StalePlanReferencesError } from './stale-plan-references.error';

const TENANT = 'tenant-1';
const EXERCISE_ID = 'exercise-1';

function libraryExercise(overrides: Partial<Exercise> = {}): Exercise {
	return {
		id: EXERCISE_ID,
		tenantId: TENANT,
		name: 'Goblet Squat',
		category: 'strength',
		primaryMuscle: 'quads',
		secondaryMuscles: ['glutes'],
		equipment: ['dumbbells'],
		demoVideoUrl: 'https://cdn.test/squat.mp4',
		demoGifUrl: null,
		thumbnailUrl: null,
		instructionSteps: ['Stand tall', 'Sit down'],
		isActive: true,
		...overrides,
	} as unknown as Exercise;
}

/**
 * A manager that records what would have been written.
 *
 * `save` assigns ids the way Postgres would, because the builder reads day ids
 * back to attach exercises to them.
 */
function fakeManager(library: Exercise[]) {
	const saved: Record<string, unknown[]> = {};
	let sequence = 0;

	const assignIds = (value: unknown): unknown => {
		if (Array.isArray(value)) {
			return value.map(assignIds);
		}
		if (value && typeof value === 'object') {
			const row = value as Record<string, unknown>;
			row.id ??= `id-${++sequence}`;
			for (const key of Object.keys(row)) {
				if (Array.isArray(row[key])) {
					assignIds(row[key]);
				}
			}
		}
		return value;
	};

	const manager = {
		getRepository: (entity: { name: string }) => ({
			create: (row: unknown) => row,
			save: async (row: unknown) => {
				(saved[entity.name] ??= []).push(row);
				return assignIds(row);
			},
			find: async (options: { where?: { isActive?: boolean } }) =>
				options?.where?.isActive ? library.filter((e) => e.isActive) : library,
		}),
	} as unknown as EntityManager;

	return { manager, saved };
}

function plan(days: unknown[], extra: Record<string, unknown> = {}) {
	return {
		name: 'Dumbbell Fat Loss',
		description: 'Three sessions a week.',
		difficulty: 'beginner',
		progression: { strategy: 'linear_reps', note: 'Add a rep each week.' },
		week: { days },
		...extra,
	};
}

function trainingDay(exercises: unknown[], dayNumber = 1) {
	return {
		dayNumber,
		name: 'Full Body',
		isRestDay: false,
		notes: null,
		exercises,
	};
}

function restDay(dayNumber: number) {
	return {
		dayNumber,
		name: null,
		isRestDay: true,
		notes: null,
		exercises: [],
	};
}

function exercise(overrides: Record<string, unknown> = {}) {
	return {
		exerciseId: EXERCISE_ID,
		position: 1,
		restSeconds: 90,
		tempo: null,
		supersetGroup: null,
		coachNotes: null,
		sets: [set()],
		...overrides,
	};
}

function set(overrides: Record<string, unknown> = {}) {
	return {
		setNumber: 1,
		setType: 'working',
		repsMin: 8,
		repsMax: 12,
		durationSeconds: null,
		intensityType: 'rpe',
		intensityValue: 7,
		...overrides,
	};
}

function build(
	days: unknown[],
	library: Exercise[] = [libraryExercise()],
	overrides: Partial<Parameters<typeof buildProgramFromPlan>[1]> = {},
	extraPlan: Record<string, unknown> = {},
) {
	const { manager, saved } = fakeManager(library);
	return buildProgramFromPlan(manager, {
		tenantId: TENANT,
		coachId: 'coach-1',
		membershipId: 'membership-1',
		plan: plan(days, extraPlan),
		durationWeeks: 4,
		goal: null,
		startDate: '2026-09-01',
		nameOverride: null,
		...overrides,
	}).then((program) => ({ program, saved }));
}

function plannedExercises(saved: Record<string, unknown[]>) {
	return (saved[PlannedExercise.name]?.[0] ?? []) as PlannedExercise[];
}

describe('buildProgramFromPlan', () => {
	it('repeats the generated week for the whole duration', async () => {
		const { program } = await build([trainingDay([exercise()])]);

		expect(program.durationWeeks).toBe(4);
		expect(program.weeks).toHaveLength(4);
		expect(program.weeks.map((week) => week.weekNumber)).toEqual([1, 2, 3, 4]);
		expect(program.weeks.every((week) => week.days.length === 1)).toBe(true);
	});

	it('carries the progression rule on every week after the first', async () => {
		const { program } = await build([trainingDay([exercise()])]);

		expect(program.weeks[0].notes).toBeNull();
		expect(program.weeks.slice(1).map((week) => week.notes)).toEqual([
			'Add a rep each week.',
			'Add a rep each week.',
			'Add a rep each week.',
		]);
	});

	it('derives the inclusive end date the programs check demands', async () => {
		const { program } = await build([trainingDay([exercise()])]);

		// ck_programs_inclusive_dates: end = start + (weeks * 7 - 1)
		expect(program.startDate).toBe('2026-09-01');
		expect(program.endDate).toBe('2026-09-28');
	});

	it('denormalises the exercise from the live library, not from the plan', async () => {
		const { saved } = await build([trainingDay([exercise()])]);
		const [first] = plannedExercises(saved);

		expect(first).toMatchObject({
			exerciseId: EXERCISE_ID,
			exerciseName: 'Goblet Squat',
			category: 'strength',
			primaryMuscle: 'quads',
			secondaryMuscles: ['glutes'],
			equipment: ['dumbbells'],
			demoVideoUrl: 'https://cdn.test/squat.mp4',
			instructionSteps: ['Stand tall', 'Sit down'],
		});
	});

	it('writes one exercise row per week, not one shared row', async () => {
		const { saved } = await build([trainingDay([exercise()])]);

		expect(plannedExercises(saved)).toHaveLength(4);
	});

	it('never prescribes a weight, whatever the plan says', async () => {
		const { saved } = await build([
			trainingDay([exercise({ sets: [set({ weightKg: 100 })] })]),
		]);
		const [first] = plannedExercises(saved);

		expect(first.sets[0].weightKg).toBeNull();
	});

	it('renumbers positions and set numbers into a contiguous order', async () => {
		const { saved } = await build([
			trainingDay([
				exercise({
					position: 7,
					sets: [set({ setNumber: 5 }), set({ setNumber: 2 })],
				}),
				exercise({ position: 3 }),
			]),
		]);
		const rows = plannedExercises(saved).slice(0, 2);

		// The one the model put at position 3 sorts ahead of the one at 7.
		expect(rows.map((row) => row.position)).toEqual([1, 2]);
		expect(rows[1].sets.map((s) => s.setNumber)).toEqual([1, 2]);
	});

	it('drops half an intensity pair rather than failing the check constraint', async () => {
		const { saved } = await build([
			trainingDay([
				exercise({
					sets: [set({ intensityType: 'rpe', intensityValue: null })],
				}),
			]),
		]);
		const [first] = plannedExercises(saved);

		// ck_planned_sets: (intensity_type IS NULL) = (intensity_value IS NULL)
		expect(first.sets[0].intensityType).toBeNull();
		expect(first.sets[0].intensityValue).toBeNull();
	});

	it('keeps a complete intensity pair', async () => {
		const { saved } = await build([trainingDay([exercise()])]);
		const [first] = plannedExercises(saved);

		expect(first.sets[0].intensityType).toBe(IntensityType.RPE);
		expect(first.sets[0].intensityValue).toBe(7);
	});

	it('falls back to a working set when the type is not one Postgres knows', async () => {
		const { saved } = await build([
			trainingDay([exercise({ sets: [set({ setType: 'megaset' })] })]),
		]);
		const [first] = plannedExercises(saved);

		expect(first.sets[0].setType).toBe(SetType.WORKING);
	});

	it('clamps a rest period that would break the app’s own limit', async () => {
		const { saved } = await build([
			trainingDay([exercise({ restSeconds: 99_999 })]),
		]);

		expect(plannedExercises(saved)[0].restSeconds).toBe(3_600);
	});

	it('writes no exercises for a rest day', async () => {
		const { saved, program } = await build([
			restDay(1),
			trainingDay([exercise()], 2),
		]);

		expect(program.weeks[0].days.map((day) => day.isRestDay)).toEqual([
			true,
			false,
		]);
		// One training day across four weeks.
		expect(plannedExercises(saved)).toHaveLength(4);
	});

	it('lets the coach override the name the model chose', async () => {
		const { program } = await build([trainingDay([exercise()])], undefined, {
			nameOverride: 'Autumn cut — block 1',
		});

		expect(program.name).toBe('Autumn cut — block 1');
	});

	describe('refuses to build', () => {
		it('when an exercise has gone from the library', async () => {
			await expect(
				build(
					[trainingDay([exercise()])],
					[libraryExercise({ isActive: false })],
				),
			).rejects.toBeInstanceOf(StalePlanReferencesError);
		});

		it('and names the ids that went missing', async () => {
			await expect(
				build([trainingDay([exercise()])], []),
			).rejects.toMatchObject({ kind: 'exercise', ids: [EXERCISE_ID] });
		});

		it('when a day number is outside 1-7', async () => {
			await expect(build([trainingDay([exercise()], 9)])).rejects.toThrow(
				'days run 1 to 7',
			);
		});

		it('when a day is repeated', async () => {
			await expect(
				build([trainingDay([exercise()], 1), trainingDay([exercise()], 1)]),
			).rejects.toThrow('repeats day 1');
		});

		it('when a day exceeds the exercises-per-day limit', async () => {
			await expect(
				build([trainingDay(Array.from({ length: 31 }, () => exercise()))]),
			).rejects.toThrow('the limit is 30');
		});

		it('when an exercise exceeds the sets-per-exercise limit', async () => {
			await expect(
				build([
					trainingDay([
						exercise({ sets: Array.from({ length: 21 }, () => set()) }),
					]),
				]),
			).rejects.toThrow('the limit is 20');
		});

		it('when an exercise has no sets', async () => {
			await expect(
				build([trainingDay([exercise({ sets: [] })])]),
			).rejects.toThrow('no sets');
		});

		it('when the stored plan has no days at all', async () => {
			await expect(build([])).rejects.toBeInstanceOf(ConflictException);
		});
	});
});
