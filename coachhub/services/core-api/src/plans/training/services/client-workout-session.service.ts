import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
	getActiveMembership,
	loadOwnedWorkoutLog,
} from '../helpers/workout-log.persistence';
import { getOrCreateInProgressWorkout } from '../helpers/workout-log-snapshot.persistence';
import { assertActiveTenant } from '../utils/training-service.utils';

@Injectable()
export class ClientWorkoutSessionService {
	constructor(private readonly dataSource: DataSource) {}

	async startOrResumeWorkout(
		clientId: string,
		tenantId: string | null,
		programDayId: string,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		return this.dataSource.transaction((manager) =>
			getOrCreateInProgressWorkout(
				manager,
				clientId,
				activeTenantId,
				programDayId,
			),
		);
	}

	async getWorkoutLog(
		clientId: string,
		tenantId: string | null,
		logId: string,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		const manager = this.dataSource.manager;
		const membership = await getActiveMembership(
			manager,
			clientId,
			activeTenantId,
		);
		const log = await loadOwnedWorkoutLog(
			manager,
			activeTenantId,
			membership.id,
			logId,
		);
		if (!log) {
			throw new NotFoundException('Workout log not found');
		}
		return log;
	}
}
