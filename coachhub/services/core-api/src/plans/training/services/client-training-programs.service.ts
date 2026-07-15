import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import { MembershipStatus, ProgramStatus, ProgramType } from '../../../common';
import { ClientTrainingCalendarQueryDto } from '../dto/client-calendar-query.dto';
import { LoggedWorkout } from '../entities/logged-workout.entity';
import { ProgramDay } from '../entities/program-day.entity';
import { Program } from '../entities/program.entity';
import {
	getDateOnlyInTimeZone,
	getScheduledDate,
	isValidDateOnly,
} from '../utils/program-date.utils';
import {
	mapBuilderProgram,
	mapClientProgramSummary,
} from '../utils/training-service.utils';

type ExistingLogState = {
	id: string;
	status: string;
	startedAt: Date;
};

type ClientLogState =
	| 'not_applicable'
	| 'not_started'
	| 'in_progress'
	| 'completed'
	| 'partial'
	| 'skipped';

@Injectable()
export class ClientTrainingProgramsService {
	constructor(
		@InjectRepository(ClientMembership)
		private readonly membershipRepository: Repository<ClientMembership>,
		@InjectRepository(Program)
		private readonly programRepository: Repository<Program>,
		@InjectRepository(ProgramDay)
		private readonly programDayRepository: Repository<ProgramDay>,
		@InjectRepository(LoggedWorkout)
		private readonly loggedWorkoutRepository: Repository<LoggedWorkout>,
	) {}

	async listPublishedPrograms(clientId: string, tenantId: string | null) {
		const membership = await this.getActiveMembership(clientId, tenantId);
		const programs = await this.programRepository.find({
			where: this.publishedProgramScope(tenantId as string, membership.id),
			order: { startDate: 'DESC', createdAt: 'DESC' },
		});

		return programs.map((program) =>
			mapClientProgramSummary(program, membership.tenant.timezone),
		);
	}

	async getCurrentPublishedProgram(clientId: string, tenantId: string | null) {
		const membership = await this.getActiveMembership(clientId, tenantId);
		const today = getDateOnlyInTimeZone(new Date(), membership.tenant.timezone);
		const programs = await this.programRepository.find({
			where: {
				...this.publishedProgramScope(tenantId as string, membership.id),
				startDate: LessThanOrEqual(today),
				endDate: MoreThanOrEqual(today),
			},
			relations: this.builderRelations(),
			order: this.builderOrder(),
		});

		if (programs.length === 0) {
			throw new NotFoundException('Current published client program not found');
		}
		if (programs.length > 1) {
			throw new ConflictException(
				'Multiple active published client programs were found',
			);
		}

		const mapped = await this.mapProgramWithLogState(programs[0], membership);
		const currentDay = mapped.weeks
			.flatMap((week) => week.days)
			.find((day) => day.scheduledDate === today);

		return { ...mapped, currentDay: currentDay ?? null };
	}

	async getPublishedProgram(
		clientId: string,
		tenantId: string | null,
		programId: string,
	) {
		const membership = await this.getActiveMembership(clientId, tenantId);
		const program = await this.programRepository.findOne({
			where: {
				...this.publishedProgramScope(tenantId as string, membership.id),
				id: programId,
			},
			relations: this.builderRelations(),
			order: this.builderOrder(),
		});
		if (!program) {
			throw new NotFoundException('Published client program not found');
		}

		return this.mapProgramWithLogState(program, membership);
	}

	async getCalendar(
		clientId: string,
		tenantId: string | null,
		query: ClientTrainingCalendarQueryDto,
	) {
		this.assertCalendarRange(query);
		const membership = await this.getActiveMembership(clientId, tenantId);
		const programs = await this.programRepository.find({
			where: {
				...this.publishedProgramScope(tenantId as string, membership.id),
				startDate: LessThanOrEqual(query.to),
				endDate: MoreThanOrEqual(query.from),
			},
			relations: { weeks: { days: { exercises: true } } },
			order: {
				startDate: 'ASC',
				weeks: { weekNumber: 'ASC', days: { dayNumber: 'ASC' } },
			},
		});
		const logState = await this.loadLogState(
			membership,
			programs.map((program) => program.id),
		);

		const calendar = programs.flatMap((program) =>
			(program.weeks ?? []).flatMap((week) =>
				(week.days ?? []).flatMap((day) => {
					const scheduledDate = getScheduledDate(
						program.startDate as string,
						week.weekNumber,
						day.dayNumber,
					);
					if (scheduledDate < query.from || scheduledDate > query.to) {
						return [];
					}

					return [
						{
							programId: program.id,
							programName: program.name,
							programSchedulePhase: mapClientProgramSummary(
								program,
								membership.tenant.timezone,
							).schedulePhase,
							id: day.id,
							weekNumber: week.weekNumber,
							dayNumber: day.dayNumber,
							name: day.name,
							notes: day.notes,
							isRestDay: day.isRestDay,
							scheduledDate,
							exerciseCount: day.exercises?.length ?? 0,
							...this.mapDayLogState(day, logState),
						},
					];
				}),
			),
		);

		return calendar.sort((left, right) =>
			left.scheduledDate.localeCompare(right.scheduledDate),
		);
	}

	async getPublishedDay(
		clientId: string,
		tenantId: string | null,
		programDayId: string,
	) {
		const membership = await this.getActiveMembership(clientId, tenantId);
		const day = await this.programDayRepository.findOne({
			where: {
				id: programDayId,
				tenantId: tenantId as string,
				programWeek: {
					program: {
						tenantId: tenantId as string,
						membershipId: membership.id,
						programType: ProgramType.CLIENT,
						status: ProgramStatus.PUBLISHED,
					},
				},
			},
			relations: {
				programWeek: { program: true },
				exercises: { sets: true },
			},
			order: {
				exercises: {
					position: 'ASC',
					sets: { setNumber: 'ASC' },
				},
			},
		});
		if (!day) {
			throw new NotFoundException('Published client program day not found');
		}

		const program = day.programWeek.program;

		const logState = await this.loadLogState(membership, [program.id]);
		const { programWeek, ...dayResponse } = day;
		return {
			...dayResponse,
			programId: program.id,
			programName: program.name,
			weekNumber: programWeek.weekNumber,
			scheduledDate: getScheduledDate(
				program.startDate as string,
				programWeek.weekNumber,
				day.dayNumber,
			),
			...this.mapDayLogState(day, logState),
		};
	}

	private async getActiveMembership(clientId: string, tenantId: string | null) {
		if (!tenantId) {
			throw new BadRequestException('No active tenant selected');
		}

		const membership = await this.membershipRepository.findOne({
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

	private publishedProgramScope(tenantId: string, membershipId: string) {
		return {
			tenantId,
			membershipId,
			programType: ProgramType.CLIENT,
			status: ProgramStatus.PUBLISHED,
		};
	}

	private builderRelations() {
		return { weeks: { days: { exercises: { sets: true } } } } as const;
	}

	private builderOrder() {
		return {
			weeks: {
				weekNumber: 'ASC' as const,
				days: {
					dayNumber: 'ASC' as const,
					exercises: {
						position: 'ASC' as const,
						sets: { setNumber: 'ASC' as const },
					},
				},
			},
		};
	}

	private async mapProgramWithLogState(
		program: Program,
		membership: ClientMembership,
	) {
		const mapped = mapBuilderProgram(program, membership.tenant.timezone);
		const logState = await this.loadLogState(membership, [program.id]);
		return {
			...mapped,
			weeks: mapped.weeks.map((week) => ({
				...week,
				days: week.days.map((day) => ({
					...day,
					...this.mapDayLogState(day, logState),
				})),
			})),
		};
	}

	private async loadLogState(
		membership: ClientMembership,
		programIds: string[],
	) {
		const byDayId = new Map<string, ExistingLogState>();
		if (programIds.length === 0) return byDayId;

		const logs = await this.loggedWorkoutRepository.find({
			where: {
				tenantId: membership.tenant.id,
				membershipId: membership.id,
				programId: In(programIds),
			},
			relations: { programDay: true },
			order: { startedAt: 'DESC' },
		});
		for (const log of logs) {
			if (log.programDay && !byDayId.has(log.programDay.id)) {
				byDayId.set(log.programDay.id, {
					id: log.id,
					status: log.status,
					startedAt: log.startedAt,
				});
			}
		}
		return byDayId;
	}

	private mapDayLogState(
		day: Pick<ProgramDay, 'id' | 'isRestDay'>,
		logsByDayId: Map<string, ExistingLogState>,
	): {
		logState: ClientLogState;
		workoutLog: ExistingLogState | null;
	} {
		if (day.isRestDay) {
			return { logState: 'not_applicable', workoutLog: null };
		}
		const workoutLog = logsByDayId.get(day.id) ?? null;
		return {
			logState: (workoutLog?.status as ClientLogState) ?? 'not_started',
			workoutLog,
		};
	}

	private assertCalendarRange(query: ClientTrainingCalendarQueryDto) {
		if (!isValidDateOnly(query.from) || !isValidDateOnly(query.to)) {
			throw new BadRequestException('Calendar range dates must be valid');
		}
		if (query.from > query.to) {
			throw new BadRequestException(
				'Calendar range from date cannot be after to date',
			);
		}
	}
}
