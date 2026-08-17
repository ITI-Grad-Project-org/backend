import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One name per row. Deliberately plain strings rather than the app's enums: a
 * migration is a record of what was done on a particular day, and importing an
 * enum that later gains or loses a member would rewrite history and break a
 * replay against an old database.
 */
type SeedExercise = [
	name: string,
	category: string,
	primaryMuscle: string,
	secondaryMuscles: string[],
	equipment: string[],
	instructionSteps: string[],
];

/**
 * The system starter set, copied into a tenant by
 * `POST /exercises/initialize-library-from-defaults`.
 *
 * <h2>Why the bodyweight and dumbbell rows outnumber the rest</h2>
 *
 * The plan-generation equipment filter is containment, not overlap: a client
 * with `{dumbbells}` is offered only exercises whose entire equipment list fits
 * inside what they own. A library weighted towards barbells and machines leaves
 * everyone training at home with almost nothing to choose from, and the AI plan
 * that results looks broken when the real problem is the library.
 *
 * Nothing is tagged `full_gym`. That value describes what a client has access
 * to, not what a movement needs — using it here would hide an exercise from
 * every client who listed their kit specifically.
 */
const DEFAULT_EXERCISES: ReadonlyArray<SeedExercise> = [
	// ── Bodyweight ────────────────────────────────────────────────────────────
	[
		'Push-up',
		'strength',
		'chest',
		['triceps', 'shoulders', 'core'],
		['none'],
		[
			'Set your hands slightly wider than your shoulders, body in one line from head to heels.',
			'Lower until your chest is a fist above the floor, elbows angled back about 45 degrees.',
			'Press away and finish with your ribs down and hips level.',
		],
	],
	[
		'Incline Push-up',
		'strength',
		'chest',
		['triceps', 'shoulders'],
		['none'],
		[
			'Place your hands on a bench, step or worktop and walk your feet back.',
			'Lower your chest to the edge under control.',
			'Press back up. The higher the surface, the easier the set.',
		],
	],
	[
		'Pike Push-up',
		'strength',
		'shoulders',
		['triceps', 'core'],
		['none'],
		[
			'From a push-up position, walk your feet in and lift your hips into an upside-down V.',
			'Lower the crown of your head towards the floor between your hands.',
			'Press back up without letting your hips drop.',
		],
	],
	[
		'Bodyweight Squat',
		'strength',
		'quads',
		['glutes', 'hamstrings', 'core'],
		['none'],
		[
			'Stand with feet about shoulder width, toes turned slightly out.',
			'Sit down and back, keeping your heels planted and chest tall.',
			'Descend as far as you can hold position, then drive through the floor to stand.',
		],
	],
	[
		'Reverse Lunge',
		'strength',
		'quads',
		['glutes', 'hamstrings'],
		['none'],
		[
			'Step one foot back and lower until both knees are near 90 degrees.',
			'Keep your torso upright and your weight through the front heel.',
			'Push through the front foot to return, then alternate.',
		],
	],
	[
		'Bulgarian Split Squat',
		'strength',
		'quads',
		['glutes', 'hamstrings'],
		['none'],
		[
			'Rest the top of your back foot on a bench or chair behind you.',
			'Lower straight down until the back knee is close to the floor.',
			'Drive through the front heel to stand. Keep the front shin near vertical.',
		],
	],
	[
		'Glute Bridge',
		'strength',
		'glutes',
		['hamstrings', 'core'],
		['none'],
		[
			'Lie on your back, knees bent, heels close to your hips.',
			'Push through your heels and lift your hips until your body is straight from knee to shoulder.',
			'Squeeze at the top and lower under control without arching your lower back.',
		],
	],
	[
		'Single-Leg Glute Bridge',
		'strength',
		'glutes',
		['hamstrings', 'core'],
		['none'],
		[
			'Set up as for a glute bridge, then lift one foot off the floor.',
			'Drive through the planted heel and lift your hips, keeping them level.',
			'Lower under control and finish all reps before swapping sides.',
		],
	],
	[
		'Nordic Hamstring Curl',
		'strength',
		'hamstrings',
		['glutes', 'core'],
		['none'],
		[
			'Kneel with your ankles anchored under something solid.',
			'Keeping hips extended, lower your torso towards the floor as slowly as you can.',
			'Catch yourself with your hands, push back to the start and repeat.',
		],
	],
	[
		'Pull-up',
		'strength',
		'back',
		['biceps', 'forearms', 'core'],
		['none'],
		[
			'Hang from a bar with an overhand grip, hands just outside your shoulders.',
			'Pull your elbows down and back until your chin clears the bar.',
			'Lower all the way under control. Keep your ribs down throughout.',
		],
	],
	[
		'Chin-up',
		'strength',
		'back',
		['biceps', 'forearms'],
		['none'],
		[
			'Hang from a bar with an underhand grip, hands about shoulder width.',
			'Pull until your chin passes the bar, leading with your elbows.',
			'Lower to a full hang under control.',
		],
	],
	[
		'Inverted Row',
		'strength',
		'back',
		['biceps', 'forearms'],
		['none'],
		[
			'Set a bar at hip height and hang underneath it with straight arms.',
			'Keep your body in one line and pull your chest to the bar.',
			'Lower under control. Walk your feet further out to make it harder.',
		],
	],
	[
		'Dip',
		'strength',
		'triceps',
		['chest', 'shoulders'],
		['none'],
		[
			'Support yourself on parallel bars with arms straight.',
			'Lower until your upper arms are roughly parallel to the floor.',
			'Press back up. Lean forward for more chest, stay upright for more triceps.',
		],
	],
	[
		'Plank',
		'core',
		'core',
		['shoulders', 'glutes'],
		['none'],
		[
			'Rest on your forearms and toes with elbows under your shoulders.',
			'Squeeze your glutes and brace your stomach so your body makes one line.',
			'Breathe normally and hold. Stop when your hips start to sag.',
		],
	],
	[
		'Side Plank',
		'core',
		'core',
		['glutes', 'shoulders'],
		['none'],
		[
			'Lie on your side and prop yourself on one forearm, elbow under your shoulder.',
			'Lift your hips so your body is straight from head to heels.',
			'Hold, then swap sides.',
		],
	],
	[
		'Dead Bug',
		'core',
		'core',
		[],
		['none'],
		[
			'Lie on your back with arms up and hips and knees bent to 90 degrees.',
			'Press your lower back into the floor and hold it there.',
			'Slowly extend one arm and the opposite leg, return, and alternate.',
		],
	],
	[
		'Hollow Body Hold',
		'core',
		'core',
		[],
		['none'],
		[
			'Lie on your back, press your lower back into the floor.',
			'Lift your shoulders and legs a few inches, arms overhead.',
			'Hold the shape. Bend your knees to make it easier.',
		],
	],
	[
		'Hanging Knee Raise',
		'core',
		'core',
		['forearms'],
		['none'],
		[
			'Hang from a bar with straight arms and shoulders engaged.',
			'Draw your knees up towards your chest, curling your pelvis under.',
			'Lower slowly without swinging.',
		],
	],
	[
		'Bird Dog',
		'core',
		'core',
		['glutes', 'back'],
		['none'],
		[
			'Start on hands and knees with a flat back.',
			'Reach one arm forward and the opposite leg back until both are level with your torso.',
			'Return under control and alternate. Keep your hips square to the floor.',
		],
	],
	[
		'Bodyweight Calf Raise',
		'strength',
		'calves',
		[],
		['none'],
		[
			'Stand tall, ideally with the balls of your feet on a step.',
			'Rise as high onto your toes as you can.',
			'Lower slowly until you feel a stretch, then repeat.',
		],
	],
	[
		'Burpee',
		'plyometric',
		'full_body',
		['chest', 'quads', 'core'],
		['none'],
		[
			'From standing, drop your hands to the floor and jump your feet back into a plank.',
			'Perform a push-up, then jump your feet back under your hips.',
			'Stand and jump, landing softly with bent knees.',
		],
	],
	[
		'Jump Squat',
		'plyometric',
		'quads',
		['glutes', 'calves'],
		['none'],
		[
			'Squat to about halfway down.',
			'Drive through the floor and jump as high as you can.',
			'Land softly, absorb into the next squat, and repeat.',
		],
	],
	[
		'Mountain Climber',
		'cardio',
		'core',
		['shoulders', 'quads'],
		['none'],
		[
			'Start in a push-up position with your body in one line.',
			'Drive one knee towards your chest, then swap quickly.',
			'Keep your hips low and your shoulders over your hands.',
		],
	],
	[
		'High Knees',
		'cardio',
		'quads',
		['calves', 'core'],
		['none'],
		[
			'Run on the spot, driving each knee up to hip height.',
			'Stay on the balls of your feet and keep your chest tall.',
			'Pump your arms in time with your legs.',
		],
	],
	[
		'Jumping Jack',
		'cardio',
		'full_body',
		['calves', 'shoulders'],
		['none'],
		[
			'Start with feet together and arms at your sides.',
			'Jump your feet wide as your arms sweep overhead.',
			'Jump back to the start and repeat at a steady rhythm.',
		],
	],
	[
		'Cat-Cow',
		'mobility',
		'back',
		['core'],
		['none'],
		[
			'Start on hands and knees.',
			'Exhale and round your spine, tucking your chin and pelvis.',
			'Inhale and reverse it, lifting your chest and tailbone. Move slowly with your breath.',
		],
	],
	[
		"World's Greatest Stretch",
		'mobility',
		'full_body',
		['quads', 'back'],
		['none'],
		[
			'Step into a deep lunge with your hands on the floor inside the front foot.',
			'Drop the back knee slightly and press your front knee out.',
			'Rotate your inside arm to the ceiling, follow it with your eyes, then swap sides.',
		],
	],
	[
		'Couch Stretch',
		'mobility',
		'quads',
		['glutes'],
		['none'],
		[
			'Place one shin against a wall or sofa with the knee on the floor.',
			'Bring the other foot forward into a lunge.',
			'Squeeze the back glute and lift your chest. Breathe and hold.',
		],
	],
	[
		'Thoracic Rotation',
		'mobility',
		'back',
		['shoulders'],
		['none'],
		[
			'Lie on your side with knees bent and stacked, arms straight in front.',
			'Keeping your knees down, sweep the top arm across and open your chest to the ceiling.',
			'Follow your hand with your eyes, then return slowly.',
		],
	],
	[
		'90/90 Hip Switch',
		'mobility',
		'glutes',
		['core'],
		['none'],
		[
			'Sit with one leg bent in front at 90 degrees and the other bent behind at 90.',
			'Keeping your chest tall, rotate both knees to switch sides.',
			'Move slowly and stop short of any pinching.',
		],
	],

	// ── Dumbbells ─────────────────────────────────────────────────────────────
	[
		'Dumbbell Bench Press',
		'strength',
		'chest',
		['triceps', 'shoulders'],
		['dumbbells'],
		[
			'Lie on a bench with a dumbbell in each hand at chest level.',
			'Press up and slightly together until your arms are straight.',
			'Lower under control until you feel a stretch across your chest.',
		],
	],
	[
		'Dumbbell Incline Press',
		'strength',
		'chest',
		['shoulders', 'triceps'],
		['dumbbells'],
		[
			'Set a bench to about 30 degrees and sit back with a dumbbell in each hand.',
			'Press the weights up over your upper chest.',
			'Lower slowly to the sides of your chest.',
		],
	],
	[
		'Dumbbell Fly',
		'strength',
		'chest',
		['shoulders'],
		['dumbbells'],
		[
			'Lie on a bench holding dumbbells above your chest, elbows slightly bent.',
			'Open your arms wide in an arc until you feel a stretch.',
			'Bring them back together over your chest, keeping the same elbow bend.',
		],
	],
	[
		'Dumbbell Shoulder Press',
		'strength',
		'shoulders',
		['triceps', 'core'],
		['dumbbells'],
		[
			'Hold dumbbells at shoulder height with palms facing forward.',
			'Press overhead until your arms are straight, ribs stacked over hips.',
			'Lower under control to the start.',
		],
	],
	[
		'Dumbbell Lateral Raise',
		'strength',
		'shoulders',
		[],
		['dumbbells'],
		[
			'Stand with dumbbells at your sides, elbows softly bent.',
			'Lift out to the sides until your hands reach shoulder height.',
			'Lower slowly. Keep the movement led by your elbows, not your hands.',
		],
	],
	[
		'Dumbbell Row',
		'strength',
		'back',
		['biceps', 'forearms'],
		['dumbbells'],
		[
			'Hinge at the hips with one hand and knee supported on a bench.',
			'Pull the dumbbell to your hip, leading with your elbow.',
			'Lower to a full stretch without letting your torso rotate.',
		],
	],
	[
		'Dumbbell Pullover',
		'strength',
		'back',
		['chest', 'triceps'],
		['dumbbells'],
		[
			'Lie on a bench holding one dumbbell above your chest with both hands.',
			'Reach it back over your head, keeping a slight elbow bend.',
			'Pull it back over your chest without flaring your ribs.',
		],
	],
	[
		'Dumbbell Bicep Curl',
		'strength',
		'biceps',
		['forearms'],
		['dumbbells'],
		[
			'Stand tall with a dumbbell in each hand, palms forward.',
			'Curl the weights up, keeping your elbows at your sides.',
			'Lower all the way under control.',
		],
	],
	[
		'Dumbbell Hammer Curl',
		'strength',
		'biceps',
		['forearms'],
		['dumbbells'],
		[
			'Hold the dumbbells with palms facing each other.',
			'Curl up without rotating your wrists.',
			'Lower slowly to a full stretch.',
		],
	],
	[
		'Dumbbell Triceps Extension',
		'strength',
		'triceps',
		[],
		['dumbbells'],
		[
			'Hold one dumbbell overhead with both hands.',
			'Bend your elbows to lower it behind your head.',
			'Press back up, keeping your elbows pointing forward.',
		],
	],
	[
		'Goblet Squat',
		'strength',
		'quads',
		['glutes', 'core'],
		['dumbbells'],
		[
			'Hold one dumbbell vertically against your chest.',
			'Squat down between your knees, keeping your chest tall and heels planted.',
			'Drive through the floor to stand.',
		],
	],
	[
		'Dumbbell Romanian Deadlift',
		'strength',
		'hamstrings',
		['glutes', 'back'],
		['dumbbells'],
		[
			'Stand holding dumbbells in front of your thighs, knees softly bent.',
			'Push your hips back and lower the weights along your legs until you feel a hamstring stretch.',
			'Drive your hips forward to stand tall. Keep your back flat throughout.',
		],
	],
	[
		'Dumbbell Walking Lunge',
		'strength',
		'quads',
		['glutes', 'hamstrings'],
		['dumbbells'],
		[
			'Hold a dumbbell in each hand at your sides.',
			'Step forward and lower until both knees are near 90 degrees.',
			'Push through the front heel and step straight into the next lunge.',
		],
	],
	[
		'Dumbbell Step-up',
		'strength',
		'quads',
		['glutes', 'calves'],
		['dumbbells'],
		[
			'Stand facing a box or bench with a dumbbell in each hand.',
			'Place one whole foot on the box and drive through it to stand up.',
			'Lower under control with the same leg. Complete all reps before swapping.',
		],
	],
	[
		"Dumbbell Farmer's Carry",
		'strength',
		'forearms',
		['core', 'back'],
		['dumbbells'],
		[
			'Pick up a heavy dumbbell in each hand and stand tall.',
			'Walk with short, steady steps, shoulders back and ribs down.',
			'Set the weights down under control at the end of the distance.',
		],
	],
	[
		'Dumbbell Calf Raise',
		'strength',
		'calves',
		[],
		['dumbbells'],
		[
			'Stand holding dumbbells at your sides, balls of your feet on a step.',
			'Rise as high onto your toes as possible.',
			'Lower slowly below the step for a full stretch.',
		],
	],

	// ── Barbell ───────────────────────────────────────────────────────────────
	[
		'Barbell Back Squat',
		'strength',
		'quads',
		['glutes', 'hamstrings', 'core'],
		['barbell'],
		[
			'Set the bar across your upper back and step out with feet shoulder width.',
			'Brace, then sit down and back, keeping your whole foot planted.',
			'Drive up through the floor without letting your hips shoot back first.',
		],
	],
	[
		'Barbell Front Squat',
		'strength',
		'quads',
		['core', 'glutes'],
		['barbell'],
		[
			'Rest the bar on the front of your shoulders with high elbows.',
			'Squat straight down, keeping your chest and elbows up.',
			'Drive back to standing. Losing elbow height is the cue to stop the set.',
		],
	],
	[
		'Barbell Deadlift',
		'strength',
		'hamstrings',
		['glutes', 'back', 'forearms'],
		['barbell'],
		[
			'Stand with the bar over your midfoot and grip just outside your knees.',
			'Take the slack out of the bar, flatten your back and brace.',
			'Push the floor away and stand tall, then return the bar under control.',
		],
	],
	[
		'Barbell Romanian Deadlift',
		'strength',
		'hamstrings',
		['glutes', 'back'],
		['barbell'],
		[
			'Start standing with the bar at your thighs, knees softly bent.',
			'Push your hips back and slide the bar down your legs until your hamstrings stretch.',
			'Drive your hips forward to stand. The knees barely move.',
		],
	],
	[
		'Barbell Bench Press',
		'strength',
		'chest',
		['triceps', 'shoulders'],
		['barbell'],
		[
			'Lie on the bench with eyes under the bar and grip just wider than shoulders.',
			'Unrack, lower the bar to your lower chest with elbows angled back.',
			'Press back up over your shoulders. Keep your feet planted throughout.',
		],
	],
	[
		'Barbell Overhead Press',
		'strength',
		'shoulders',
		['triceps', 'core'],
		['barbell'],
		[
			'Hold the bar at your collarbone with hands just outside your shoulders.',
			'Brace your stomach and glutes, then press overhead, moving your head back out of the way.',
			'Finish with the bar over your midfoot and lower under control.',
		],
	],
	[
		'Barbell Row',
		'strength',
		'back',
		['biceps', 'forearms'],
		['barbell'],
		[
			'Hinge forward to about 45 degrees with a flat back.',
			'Pull the bar to your lower ribs, leading with your elbows.',
			'Lower to a full stretch without letting your torso rise.',
		],
	],
	[
		'Barbell Hip Thrust',
		'strength',
		'glutes',
		['hamstrings'],
		['barbell'],
		[
			'Sit with your upper back against a bench and the bar over your hips.',
			'Drive through your heels until your hips are level with your knees and shoulders.',
			'Squeeze at the top, then lower under control.',
		],
	],
	[
		'Barbell Curl',
		'strength',
		'biceps',
		['forearms'],
		['barbell'],
		[
			'Stand holding the bar with an underhand, shoulder-width grip.',
			'Curl up while keeping your elbows pinned at your sides.',
			'Lower all the way. Resist the urge to swing at the end of a set.',
		],
	],

	// ── Kettlebell ────────────────────────────────────────────────────────────
	[
		'Kettlebell Swing',
		'plyometric',
		'glutes',
		['hamstrings', 'back', 'core'],
		['kettlebell'],
		[
			'Stand with the bell a foot in front of you and hinge to grab it.',
			'Hike it back between your legs, then snap your hips forward to float it to chest height.',
			'Let it swing back and repeat. The arms only guide it; the hips do the work.',
		],
	],
	[
		'Kettlebell Goblet Squat',
		'strength',
		'quads',
		['glutes', 'core'],
		['kettlebell'],
		[
			'Hold the bell by the horns against your chest.',
			'Squat down between your knees with a tall chest.',
			'Drive through the floor to stand.',
		],
	],
	[
		'Turkish Get-up',
		'strength',
		'full_body',
		['shoulders', 'core'],
		['kettlebell'],
		[
			'Lie on your back with the bell pressed over one shoulder, same-side knee bent.',
			'Roll to your elbow, then your hand, then bridge and sweep your leg through to kneeling.',
			'Stand, then reverse every step exactly. Keep your eyes on the bell.',
		],
	],

	// ── Resistance bands ──────────────────────────────────────────────────────
	[
		'Band Pull-apart',
		'strength',
		'back',
		['shoulders'],
		['resistance_bands'],
		[
			'Hold a band at shoulder height with straight arms.',
			'Pull it apart until it touches your chest, squeezing your shoulder blades.',
			'Return slowly under tension.',
		],
	],
	[
		'Band Face Pull',
		'strength',
		'shoulders',
		['back'],
		['resistance_bands'],
		[
			'Anchor a band at head height and hold one end in each hand.',
			'Pull towards your forehead, splitting your hands apart as you go.',
			'Return under control. Keep your elbows high throughout.',
		],
	],
	[
		'Band Lateral Walk',
		'strength',
		'glutes',
		[],
		['resistance_bands'],
		[
			'Loop a band just above your knees and drop into a quarter squat.',
			'Step sideways, keeping constant tension on the band.',
			'Take the same number of steps in each direction.',
		],
	],
	[
		'Band Bicep Curl',
		'strength',
		'biceps',
		['forearms'],
		['resistance_bands'],
		[
			'Stand on the middle of a band and hold an end in each hand.',
			'Curl up with your elbows at your sides.',
			'Lower slowly against the band’s pull.',
		],
	],

	// ── Machines and cables ───────────────────────────────────────────────────
	[
		'Lat Pulldown',
		'strength',
		'back',
		['biceps', 'forearms'],
		['machines'],
		[
			'Sit with your thighs under the pads and take a wide overhand grip.',
			'Pull the bar to your upper chest, driving your elbows down.',
			'Return to a full stretch under control.',
		],
	],
	[
		'Seated Cable Row',
		'strength',
		'back',
		['biceps', 'forearms'],
		['machines'],
		[
			'Sit tall with a slight knee bend and grip the handle.',
			'Pull to your stomach, squeezing your shoulder blades together.',
			'Let the weight stretch you forward without rounding your lower back.',
		],
	],
	[
		'Leg Press',
		'strength',
		'quads',
		['glutes', 'hamstrings'],
		['machines'],
		[
			'Sit with your feet about shoulder width on the platform.',
			'Lower until your knees reach about 90 degrees, keeping your lower back on the pad.',
			'Press back up without locking your knees out hard.',
		],
	],
	[
		'Leg Curl',
		'strength',
		'hamstrings',
		[],
		['machines'],
		[
			'Set the pad just above your heels.',
			'Curl your heels towards your glutes.',
			'Lower slowly to a full stretch.',
		],
	],
	[
		'Leg Extension',
		'strength',
		'quads',
		[],
		['machines'],
		[
			'Set the pad on the front of your ankles and sit back into the seat.',
			'Straighten your knees fully and pause briefly.',
			'Lower under control.',
		],
	],
	[
		'Cable Triceps Pushdown',
		'strength',
		'triceps',
		[],
		['machines'],
		[
			'Stand at a high pulley and hold the bar with elbows at your sides.',
			'Push down until your arms are straight.',
			'Return to about 90 degrees without letting your elbows drift forward.',
		],
	],
	[
		'Chest Press Machine',
		'strength',
		'chest',
		['triceps', 'shoulders'],
		['machines'],
		[
			'Set the seat so the handles sit level with your mid chest.',
			'Press forward until your arms are straight.',
			'Return under control until you feel a stretch.',
		],
	],
	[
		'Cable Woodchop',
		'core',
		'core',
		['shoulders'],
		['machines'],
		[
			'Set the pulley high and stand side-on, holding the handle with both hands.',
			'Rotate through your trunk and pull down across your body to the opposite hip.',
			'Return slowly. Keep your arms fairly straight and let your torso do the work.',
		],
	],
	[
		'Treadmill Run',
		'cardio',
		'full_body',
		['quads', 'calves'],
		['machines'],
		[
			'Start with a few minutes of easy walking to warm up.',
			'Build to the prescribed pace and hold it, breathing steadily.',
			'Finish with several minutes of walking to cool down.',
		],
	],
	[
		'Stationary Bike',
		'cardio',
		'quads',
		['calves', 'glutes'],
		['machines'],
		[
			'Set the saddle so your knee stays slightly bent at the bottom of the stroke.',
			'Ride at the prescribed effort, keeping your cadence smooth.',
			'Spin easy for a few minutes to finish.',
		],
	],
	[
		'Rowing Machine',
		'cardio',
		'back',
		['quads', 'core'],
		['machines'],
		[
			'Drive with your legs first, then swing your torso back, then pull with your arms.',
			'Reverse that order on the way in: arms, torso, legs.',
			'Keep the stroke long and unhurried rather than fast and short.',
		],
	],
];

export class SeedDefaultExercises1786938000000 implements MigrationInterface {
	name = 'SeedDefaultExercises1786938000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// One statement rather than seventy round trips, and `ON CONFLICT (name)`
		// makes a re-run a no-op instead of a unique-violation.
		const columns = 6;
		const values = DEFAULT_EXERCISES.map((_, row) => {
			const offset = row * columns;
			return `($${offset + 1}, $${offset + 2}::exercise_category, $${offset + 3}::muscle_group, $${offset + 4}::muscle_group[], $${offset + 5}::equipment_type[], $${offset + 6}::text[], TRUE)`;
		}).join(',\n\t\t\t\t');

		await queryRunner.query(
			`INSERT INTO "default_exercises"
				("name", "category", "primary_muscle", "secondary_muscles",
				 "equipment", "instruction_steps", "is_active")
			 VALUES
				${values}
			 ON CONFLICT ("name") DO NOTHING`,
			DEFAULT_EXERCISES.flat(),
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Only the rows this migration added, matched by name. A tenant's copies in
		// `exercises` are theirs and are left alone — `source_seed_id` is ON DELETE
		// SET NULL precisely so removing a seed never touches a coach's library.
		await queryRunner.query(
			`DELETE FROM "default_exercises" WHERE "name" = ANY($1::text[])`,
			[DEFAULT_EXERCISES.map(([name]) => name)],
		);
	}
}
