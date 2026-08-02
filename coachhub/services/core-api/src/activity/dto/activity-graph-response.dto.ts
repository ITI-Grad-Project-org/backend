import { ApiProperty } from '@nestjs/swagger';
import {
	ActivityGraphPeriodMode,
	ActivityLevel,
} from '../utils/activity-graph.utils';

export class ActivityGraphPeriodResponseDto {
	@ApiProperty({ enum: ['rolling', 'calendar_year'] })
	mode: ActivityGraphPeriodMode;

	@ApiProperty({ example: 2025, nullable: true })
	year: number | null;

	@ApiProperty({ example: '2025-01-01', format: 'date' })
	from: string;

	@ApiProperty({ example: '2025-12-31', format: 'date' })
	to: string;
}

export class ActivityGraphSummaryResponseDto {
	@ApiProperty({ example: 187 })
	totalActivities: number;

	@ApiProperty({ example: 64 })
	activeDays: number;

	@ApiProperty({ example: 5 })
	currentStreakDays: number;

	@ApiProperty({ example: 18 })
	longestStreakDays: number;
}

export class ActivityGraphDayResponseDto {
	@ApiProperty({ example: '2025-01-01', format: 'date' })
	date: string;

	@ApiProperty({ example: 3 })
	activityCount: number;

	@ApiProperty({ enum: [0, 1, 2, 3, 4], example: 1 })
	level: ActivityLevel;
}

export class ActivityGraphResponseDto {
	@ApiProperty({ example: 'Africa/Cairo' })
	timezone: string;

	@ApiProperty({ type: ActivityGraphPeriodResponseDto })
	period: ActivityGraphPeriodResponseDto;

	@ApiProperty({ type: ActivityGraphSummaryResponseDto })
	summary: ActivityGraphSummaryResponseDto;

	@ApiProperty({
		type: ActivityGraphDayResponseDto,
		isArray: true,
	})
	days: ActivityGraphDayResponseDto[];
}
