import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProgramType } from '../../../common';
import { LoggedWorkout } from '../entities/logged-workout.entity';
import { ProgramDay } from '../entities/program-day.entity';
import { Program } from '../entities/program.entity';
import { getScheduledDate } from '../utils/program-date.utils';
import { assertActiveTenant } from '../utils/training-service.utils';

@Injectable()
export class WorkoutLogReviewService {
	constructor(
		@InjectRepository(Program)
		private readonly programRepository: Repository<Program>,
		@InjectRepository(ProgramDay)
		private readonly programDayRepository: Repository<ProgramDay>,
		@InjectRepository(LoggedWorkout)
		private readonly loggedWorkoutRepository: Repository<LoggedWorkout>,
	) {}

	async listProgramLogs(tenantId: string | null, programId: string) {
		const activeTenantId = assertActiveTenant(tenantId);
		const program = await this.getClientProgram(activeTenantId, programId);
		const logs = await this.loggedWorkoutRepository.find({
			where: {
				tenantId: activeTenantId,
				programId: program.id,
				membershipId: program.membershipId as string,
			},
			relations: { exercises: { sets: true } },
			order: {
				scheduledDate: 'DESC',
				startedAt: 'DESC',
				exercises: {
					position: 'ASC',
					sets: { setNumber: 'ASC' },
				},
			},
		});

		return { program: mapProgramReviewSummary(program), logs };
	}

	async getProgramDayLog(
		tenantId: string | null,
		programId: string,
		programDayId: string,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		const day = await this.programDayRepository.findOne({
			where: {
				id: programDayId,
				tenantId: activeTenantId,
				programWeek: {
					program: {
						id: programId,
						tenantId: activeTenantId,
						programType: ProgramType.CLIENT,
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
			throw new NotFoundException('Client program day not found');
		}

		const program = day.programWeek.program;
		const workoutLog = await this.loggedWorkoutRepository.findOne({
			where: {
				tenantId: activeTenantId,
				programId: program.id,
				membershipId: program.membershipId as string,
				programDayId: day.id,
			},
			relations: { exercises: { sets: true } },
			order: {
				exercises: {
					position: 'ASC',
					sets: { setNumber: 'ASC' },
				},
			},
		});
		const { programWeek, ...prescription } = day;

		return {
			program: mapProgramReviewSummary(program),
			scheduledDate: getScheduledDate(
				program.startDate as string,
				programWeek.weekNumber,
				day.dayNumber,
			),
			prescription: {
				...prescription,
				weekNumber: programWeek.weekNumber,
			},
			workoutLog,
		};
	}

	private async getClientProgram(tenantId: string, programId: string) {
		const program = await this.programRepository.findOne({
			where: {
				id: programId,
				tenantId,
				programType: ProgramType.CLIENT,
			},
		});
		if (!program) {
			throw new NotFoundException('Client program not found');
		}
		return program;
	}
}

function mapProgramReviewSummary(program: Program) {
	return {
		id: program.id,
		membershipId: program.membershipId,
		name: program.name,
		startDate: program.startDate,
		endDate: program.endDate,
		status: program.status,
	};
}
