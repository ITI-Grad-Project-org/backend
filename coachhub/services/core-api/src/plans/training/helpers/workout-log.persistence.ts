import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import { MembershipStatus, SessionStatus } from '../../../common';
import { LoggedSet } from '../entities/logged-set.entity';
import { LoggedWorkout } from '../entities/logged-workout.entity';

/**
 * Resolves the client's active membership inside the selected tenant. Keeping
 * this check in the transaction makes membership ownership the boundary for
 * every subsequent workout-log query.
 */
export async function getActiveMembership(
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

/**
 * Loads and row-locks an owned in-progress workout before any mutation. The
 * status check under the same lock prevents concurrent writes and guarantees
 * that completed or skipped logs remain immutable.
 */
export async function lockOwnedInProgressLog(
	manager: EntityManager,
	tenantId: string,
	membershipId: string,
	logId: string,
) {
	const log = await manager
		.getRepository(LoggedWorkout)
		.createQueryBuilder('log')
		.where('log.id = :logId', { logId })
		.andWhere('log.tenant_id = :tenantId', { tenantId })
		.andWhere('log.membership_id = :membershipId', { membershipId })
		.setLock('pessimistic_write')
		.getOne();
	if (!log) {
		throw new NotFoundException('Workout log not found');
	}
	if (log.status !== SessionStatus.IN_PROGRESS) {
		throw new ConflictException('Finalized workout logs are immutable');
	}
	return log;
}

/**
 * Returns only prescribed logged sets, excluding client-added extras. Completion
 * and whole-day skipping use this list because extra sets must not determine
 * whether the original prescription was finished.
 */
export function loadPrescribedLoggedSets(
	manager: EntityManager,
	logId: string,
) {
	return manager.getRepository(LoggedSet).find({
		where: {
			isExtra: false,
			loggedExercise: { loggedWorkoutId: logId },
		},
		order: { loggedExerciseId: 'ASC', setNumber: 'ASC' },
	});
}

/** Returns every prescribed and extra set id belonging to one workout log. */
export async function loadWorkoutLoggedSetIds(
	manager: EntityManager,
	logId: string,
) {
	const sets = await manager.getRepository(LoggedSet).find({
		select: { id: true },
		where: { loggedExercise: { loggedWorkoutId: logId } },
	});
	return sets.map((set) => set.id);
}

/**
 * Loads a workout only when it belongs to the active tenant membership, then
 * hydrates its exercises and sets in display order. The ownership predicates
 * prevent a valid log id from crossing tenant or client boundaries.
 */
export function loadOwnedWorkoutLog(
	manager: EntityManager,
	tenantId: string,
	membershipId: string,
	logId: string,
) {
	return manager.getRepository(LoggedWorkout).findOne({
		where: { id: logId, tenantId, membershipId },
		relations: { exercises: { sets: true } },
		order: {
			exercises: {
				position: 'ASC',
				sets: { setNumber: 'ASC' },
			},
		},
	});
}
