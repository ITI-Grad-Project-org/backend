import 'reflect-metadata';
import { EntityManager } from 'typeorm';
import AppDataSource from '../data-source';

import { Checkin } from '../checkins/entities/checkin.entity';
import { CheckinStatus } from '../common';

/**
 * Gives every active client a check-in that is waiting on their coach.
 *
 * The demo tenants already carry check-in history, but the most recent week is
 * a hole: the seeded clients jump from a `submitted` week to a `pending` one
 * dated in the future, so a coach logging in has nothing in front of them to
 * respond to. Two tenants (hand-made accounts rather than seeded ones) have no
 * check-ins at all.
 *
 * Every row this writes is `submitted` and nothing more — client notes and
 * metrics are filled in, `reviewed_at`, `reviewed_by` and `coach_feedback` stay
 * NULL. That is the state `ck_checkins_submission_state` calls submitted, and
 * it is what puts the row in the coach's review queue rather than in their
 * history.
 *
 * Additive and re-runnable: a membership that already has a check-in on a
 * target date is skipped, so this can be run twice without tripping
 * `uq_checkins_membership_date`. Set SEED_DRY_RUN=1 to exercise the whole thing
 * against the real schema and roll it back.
 */

/** Check-ins fall on Mondays here, matching the cadence already in the data. */
const CADENCE_WEEKDAY = 1;

/** Weekly slots to consider, newest first: this Monday, and the two before it. */
const CANDIDATE_WEEKS = 3;

/** A client with no history at all gets a short run; everyone else gets the gap. */
const BACKFILL_FOR_EMPTY = 3;
const BACKFILL_FOR_EXISTING = 1;

/** Sentinel used to roll the whole transaction back under SEED_DRY_RUN=1. */
class DryRunRollback extends Error {}

interface MembershipRow {
	membership_id: string;
	tenant_id: string;
	tenant_name: string;
	client_name: string;
}

function makeRng(seed: number) {
	let state = seed >>> 0 || 1;
	return () => {
		state ^= state << 13;
		state >>>= 0;
		state ^= state >>> 17;
		state ^= state << 5;
		state >>>= 0;
		return state / 0xffffffff;
	};
}
type Rng = () => number;

function randInt(rng: Rng, min: number, max: number): number {
	return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(rng: Rng, items: readonly T[]): T {
	return items[Math.floor(rng() * items.length)];
}

/**
 * Seed derived from the row itself, so a re-run produces the same notes and the
 * same numbers — and two clients never produce the same ones.
 */
function seedFrom(...parts: string[]): number {
	let hash = 2166136261;
	for (const char of parts.join('|')) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

/** Most recent CADENCE_WEEKDAY on or before today, as YYYY-MM-DD. */
function mostRecentCadenceDay(): Date {
	const date = new Date();
	date.setUTCHours(12, 0, 0, 0);
	const shift = (date.getUTCDay() - CADENCE_WEEKDAY + 7) % 7;
	date.setUTCDate(date.getUTCDate() - shift);
	return date;
}

function minusWeeks(from: Date, weeks: number): Date {
	const date = new Date(from);
	date.setUTCDate(date.getUTCDate() - weeks * 7);
	return date;
}

function dateStr(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** Evening of the check-in day — when a client actually sits down and writes it. */
function submittedAtFor(date: Date): Date {
	const at = new Date(date);
	at.setUTCHours(18, 0, 0, 0);
	return at;
}

// ── What the clients actually wrote ─────────────────────────────────────────
// Deliberately not one string reused everywhere: a review queue where every
// entry reads identically is worse than no data, because it tells a coach
// nothing and it shows in a demo immediately.

const GOOD_WEEKS = [
	'Best week in a while — every session done and the last set of squats moved better than it has in a month.',
	'Felt strong throughout. Added a little weight on the pulls and it did not feel like a stretch.',
	'Really good week. Sleep finally settled down and everything else followed.',
	'All sessions in, no complaints. The Friday session was the best one yet.',
	'Energy was high all week. I could probably have pushed the last session harder.',
];

const MIXED_WEEKS = [
	'Decent week overall. Wednesday was a write-off — work ran late — but I made it up on Saturday.',
	'Three out of four. Missed the mid-week session but the rest felt solid.',
	'Bit of a mixed one. Training was fine, eating was not, especially over the weekend.',
	'Good sessions, poor sleep. Managed everything but the last one was a grind.',
	'Hit everything, though the accessory work felt heavier than usual by the end.',
];

const HARD_WEEKS = [
	'Tough week. Only got two sessions in and both felt heavy — travelling for work did not help.',
	'Struggled this one. Low energy from about Tuesday and I cut the last session short.',
	'Not my best. Sleep was broken most nights and I could feel it in the compounds.',
	'Fell off a bit. Missed two sessions and the food was all over the place.',
	'Right shoulder felt a bit off during pressing so I dropped the weight and kept the reps.',
];

const QUESTIONS = [
	' Should I add weight next week or hold here?',
	' Happy to keep going as is unless you want to change anything.',
	' Let me know if you want me to swap anything out.',
	' Any thoughts on the shoulder?',
	'',
	'',
];

/** Notes and numbers that agree with each other — a bad week does not report 9/10 mood. */
function composeSubmission(rng: Rng) {
	const roll = rng();
	const [pool, moodRange, energyRange, sleepRange] =
		roll < 0.45
			? ([GOOD_WEEKS, [7, 9], [7, 9], [65, 82]] as const)
			: roll < 0.8
				? ([MIXED_WEEKS, [5, 7], [5, 7], [55, 72]] as const)
				: ([HARD_WEEKS, [3, 5], [3, 5], [45, 62]] as const);

	return {
		notes: `${pick(rng, pool)}${pick(rng, QUESTIONS)}`.trim(),
		metrics: {
			mood: randInt(rng, moodRange[0], moodRange[1]),
			energy: randInt(rng, energyRange[0], energyRange[1]),
			// Tenths, to match the sleep_hours values already in the table.
			sleep_hours: randInt(rng, sleepRange[0], sleepRange[1]) / 10,
		},
	};
}

async function main() {
	const isDryRun = process.env.SEED_DRY_RUN === '1';

	await AppDataSource.initialize();

	const anchor = mostRecentCadenceDay();
	const candidates = Array.from({ length: CANDIDATE_WEEKS }, (_, week) =>
		dateStr(minusWeeks(anchor, week)),
	);

	const created: Array<{
		tenant: string;
		client: string;
		dates: string[];
	}> = [];
	let skipped = 0;

	try {
		await AppDataSource.transaction(async (manager: EntityManager) => {
			// Active memberships only. An invited or blocked client has no business
			// appearing in a coach's review queue, and a soft-deleted one is gone.
			const memberships: MembershipRow[] = await manager.query(
				`SELECT m.id            AS membership_id,
				        m.tenant_id     AS tenant_id,
				        t.name          AS tenant_name,
				        coalesce(nullif(trim(coalesce(c.first_name, '') || ' ' ||
				                             coalesce(c.last_name, '')), ''),
				                 'Unnamed client') AS client_name
				 FROM memberships m
				 JOIN tenants t ON t.id = m.tenant_id
				 LEFT JOIN clients c ON c.id = m.client_id
				 WHERE m.status = 'active'
				   AND m.deleted_at IS NULL
				   AND m.client_id IS NOT NULL
				 ORDER BY t.name, client_name`,
			);

			for (const row of memberships) {
				const existing: Array<{ scheduled_for: string }> = await manager.query(
					`SELECT to_char(scheduled_for, 'YYYY-MM-DD') AS scheduled_for
					 FROM checkins WHERE membership_id = $1`,
					[row.membership_id],
				);
				const taken = new Set(existing.map((e) => e.scheduled_for));

				const wanted =
					existing.length === 0 ? BACKFILL_FOR_EMPTY : BACKFILL_FOR_EXISTING;
				const targets = candidates
					.filter((date) => !taken.has(date))
					.slice(0, wanted);

				if (targets.length === 0) {
					skipped++;
					continue;
				}

				const rows = targets.map((date) => {
					const rng = makeRng(seedFrom(row.membership_id, date));
					const { notes, metrics } = composeSubmission(rng);
					return manager.create(Checkin, {
						tenantId: row.tenant_id,
						membershipId: row.membership_id,
						scheduledFor: date,
						status: CheckinStatus.SUBMITTED,
						submittedAt: submittedAtFor(new Date(`${date}T12:00:00Z`)),
						clientNotes: notes,
						metrics,
						// The whole point: this is what leaves it in the review queue.
						reviewedAt: null,
						reviewedBy: null,
						coachFeedback: null,
					});
				});

				await manager.save(rows);
				created.push({
					tenant: row.tenant_name,
					client: row.client_name,
					dates: targets,
				});
			}

			if (isDryRun) {
				// Everything above has been exercised against the real schema;
				// throwing here rolls it all back instead of committing.
				throw new DryRunRollback();
			}
		});
	} catch (error) {
		if (!(error instanceof DryRunRollback)) throw error;
	} finally {
		await AppDataSource.destroy();
	}

	const total = created.reduce((sum, row) => sum + row.dates.length, 0);
	console.log(
		isDryRun
			? '\n======== DRY RUN — NOTHING WAS COMMITTED ========'
			: '\n=========== PENDING CHECK-INS ADDED ===========',
	);
	console.log(`Candidate weeks: ${candidates.join(', ')}\n`);

	let currentTenant = '';
	for (const row of created) {
		if (row.tenant !== currentTenant) {
			currentTenant = row.tenant;
			console.log(`${currentTenant}`);
		}
		console.log(`  ${row.client.padEnd(24)} ${row.dates.join(', ')}`);
	}

	console.log(
		`\n${total} check-in(s) across ${created.length} client(s), all awaiting review.`,
	);
	if (skipped > 0) {
		console.log(`${skipped} client(s) already covered — left untouched.`);
	}
	console.log('===============================================\n');
}

main().catch(async (error) => {
	console.error('add-pending-checkins failed:', error);
	try {
		await AppDataSource.destroy();
	} catch {
		/* already closed */
	}
	process.exit(1);
});
