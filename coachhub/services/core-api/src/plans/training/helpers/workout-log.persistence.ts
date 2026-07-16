import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import { MembershipStatus, SessionStatus } from '../../../common';
import { LoggedSet } from '../entities/logged-set.entity';
import { LoggedWorkout } from '../entities/logged-workout.entity';

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
