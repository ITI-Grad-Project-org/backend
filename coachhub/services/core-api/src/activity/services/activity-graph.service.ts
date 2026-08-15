import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { getDateOnlyInTimeZone } from '../../common';
import { ActivityGraphResponseDto } from '../dto/activity-graph-response.dto';
import { ActivityLog } from '../entities/activity-log.entity';
import {
	ActivityGraphPeriod,
	getActivityLevel,
	getCurrentActivityStreak,
	getDatesInRange,
	getLongestActivityStreak,
	resolveActivityGraphPeriod,
} from '../utils/activity-graph.utils';

interface DailyActivityCountRow {
	activityDate: string;
	activityCount: string;
}

interface ActiveDateRow {
	activityDate: string;
}

@Injectable()
export class ActivityGraphService {
	constructor(
		@InjectRepository(ActivityLog)
		private readonly activityLogRepository: Repository<ActivityLog>,
		@InjectRepository(Client)
		private readonly clientRepository: Repository<Client>,
	) {}

	async getActivityGraph(
		clientId: string,
		year?: number,
		now = new Date(),
	): Promise<ActivityGraphResponseDto> {
		const client = await this.clientRepository.findOne({
			where: { id: clientId },
			select: { id: true, timezone: true },
		});
		if (!client) {
			throw new NotFoundException('Client not found');
		}

		const timezone = client.timezone || 'UTC';
		const clientToday = getDateOnlyInTimeZone(now, timezone);
		const period = resolveActivityGraphPeriod(clientToday, year);
		const [dailyCountRows, activeDateRows] = await Promise.all([
			this.loadDailyActivityCounts(clientId, period),
			this.loadLifetimeActiveDates(clientId),
		]);

		const activityCountByDate = new Map(
			dailyCountRows.map((row) => [
				row.activityDate,
				Number(row.activityCount),
			]),
		);
		const days = getDatesInRange(period.from, period.to).map((date) => {
			const activityCount = activityCountByDate.get(date) ?? 0;
			return {
				date,
				activityCount,
				level: getActivityLevel(activityCount),
			};
		});
		const activeDates = activeDateRows.map((row) => row.activityDate);

		return {
			timezone,
			period,
			summary: {
				totalActivities: days.reduce(
					(total, day) => total + day.activityCount,
					0,
				),
				activeDays: days.filter((day) => day.activityCount > 0).length,
				currentStreakDays: getCurrentActivityStreak(activeDates, clientToday),
				longestStreakDays: getLongestActivityStreak(activeDates),
			},
			days,
		};
	}

	private loadDailyActivityCounts(
		clientId: string,
		period: ActivityGraphPeriod,
	) {
		return this.activityLogRepository
			.createQueryBuilder('activity')
			.select("TO_CHAR(activity.activityDate, 'YYYY-MM-DD')", 'activityDate')
			.addSelect('COUNT(*)', 'activityCount')
			.where('activity.clientId = :clientId', { clientId })
			.andWhere('activity.activityDate BETWEEN :from AND :to', {
				from: period.from,
				to: period.to,
			})
			.groupBy('activity.activityDate')
			.orderBy('activity.activityDate', 'ASC')
			.getRawMany<DailyActivityCountRow>();
	}

	private loadLifetimeActiveDates(clientId: string) {
		return this.activityLogRepository
			.createQueryBuilder('activity')
			.select("TO_CHAR(activity.activityDate, 'YYYY-MM-DD')", 'activityDate')
			.distinct(true)
			.where('activity.clientId = :clientId', { clientId })
			.orderBy("TO_CHAR(activity.activityDate, 'YYYY-MM-DD')", 'ASC')
			.getRawMany<ActiveDateRow>();
	}
}
