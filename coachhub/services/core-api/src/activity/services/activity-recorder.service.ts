import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { getDateOnlyInTimeZone } from '../../common';
import { ActivityLog } from '../entities/activity-log.entity';
import { ActivityType } from '../enums/activity-type.enum';
import { validateActivitySourceKey } from '../utils/activity-source-key.utils';

export interface RecordActivityInput {
	clientId: string;
	tenantId: string;
	membershipId: string;
	activityType: ActivityType;
	sourceKey: string;
	occurredAt: Date;
}

@Injectable()
export class ActivityRecorderService {
	async record(manager: EntityManager, input: RecordActivityInput) {
		validateActivitySourceKey(input.sourceKey);

		const client = await manager.getRepository(Client).findOne({
			where: { id: input.clientId },
			select: { id: true, timezone: true },
		});
		if (!client) {
			throw new NotFoundException('Client not found');
		}

		const activityDate = getDateOnlyInTimeZone(
			input.occurredAt,
			client.timezone || 'UTC',
		);

		await manager
			.getRepository(ActivityLog)
			.createQueryBuilder()
			.insert()
			.into(ActivityLog)
			.values({ ...input, activityDate })
			.orIgnore()
			.execute();
	}

	async remove(
		manager: EntityManager,
		clientId: string,
		activityType: ActivityType,
		sourceKey: string,
	) {
		validateActivitySourceKey(sourceKey);
		await manager.getRepository(ActivityLog).delete({
			clientId,
			activityType,
			sourceKey,
		});
	}

	async removeMany(
		manager: EntityManager,
		clientId: string,
		activityType: ActivityType,
		sourceKeys: string[],
	) {
		if (sourceKeys.length === 0) return;
		sourceKeys.forEach(validateActivitySourceKey);

		await manager.getRepository(ActivityLog).delete({
			clientId,
			activityType,
			sourceKey: In(sourceKeys),
		});
	}
}
