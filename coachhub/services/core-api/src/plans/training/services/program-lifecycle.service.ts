import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import { MembershipStatus, ProgramStatus, ProgramType } from '../../../common';
import { RescheduleClientProgramDto } from '../dto/program-lifecycle.dto';
import { ProgramDay } from '../entities/program-day.entity';
import { Program } from '../entities/program.entity';
import {
	deriveInclusiveEndDate,
	getDateOnlyInTimeZone,
} from '../utils/program-date.utils';
import {
	assertActiveTenant,
	assertStartDate,
} from '../utils/training-service.utils';
import { ClientProgramsService } from './client-programs.service';

type PublishableDay = {
	id: string;
	isRestDay: boolean;
	exerciseCount: string | number;
};

@Injectable()
export class ProgramLifecycleService {
	constructor(
		private readonly dataSource: DataSource,
		private readonly clientProgramsService: ClientProgramsService,
	) {}

	async publishClientProgram(tenantId: string | null, programId: string) {
		const activeTenantId = assertActiveTenant(tenantId);
		await this.dataSource.transaction(async (manager) => {
			const program = await lockClientProgram(
				manager,
				activeTenantId,
				programId,
			);
			if (program.status !== ProgramStatus.DRAFT) {
				throw new ConflictException(
					'Only draft client programs can be published',
				);
			}

			await lockActiveMembership(
				manager,
				activeTenantId,
				program.membershipId as string,
			);
			await assertProgramCompleteness(manager, program);
			await assertNoPublishedOverlap(manager, program);

			program.status = ProgramStatus.PUBLISHED;
			await manager.getRepository(Program).save(program);
		});

		return this.clientProgramsService.getClientProgram(
			activeTenantId,
			programId,
		);
	}

	async rescheduleClientProgram(
		tenantId: string | null,
		programId: string,
		body: RescheduleClientProgramDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		await this.dataSource.transaction(async (manager) => {
			const program = await lockClientProgram(
				manager,
				activeTenantId,
				programId,
			);
			if (program.status !== ProgramStatus.PUBLISHED) {
				throw new ConflictException(
					'Only published client programs can be rescheduled',
				);
			}

			const today = getDateOnlyInTimeZone(new Date(), program.tenant.timezone);
			if ((program.startDate as string) <= today) {
				throw new ConflictException(
					'Active or ended client programs cannot be rescheduled',
				);
			}
			assertStartDate(body.startDate, program.tenant.timezone);

			await lockActiveMembership(
				manager,
				activeTenantId,
				program.membershipId as string,
			);
			program.startDate = body.startDate;
			program.endDate = deriveInclusiveEndDate(
				body.startDate,
				program.durationWeeks,
			);
			await assertNoPublishedOverlap(manager, program);
			await manager.getRepository(Program).save(program);
		});

		return this.clientProgramsService.getClientProgram(
			activeTenantId,
			programId,
		);
	}

	async cancelClientProgram(tenantId: string | null, programId: string) {
		const activeTenantId = assertActiveTenant(tenantId);
		await this.dataSource.transaction(async (manager) => {
			const program = await lockClientProgram(
				manager,
				activeTenantId,
				programId,
			);
			if (program.status === ProgramStatus.CANCELLED) {
				throw new ConflictException('Client program is already cancelled');
			}

			program.status = ProgramStatus.CANCELLED;
			await manager.getRepository(Program).save(program);
		});

		return this.clientProgramsService.getClientProgram(
			activeTenantId,
			programId,
		);
	}

	async archiveClientProgram(tenantId: string | null, programId: string) {
		const activeTenantId = assertActiveTenant(tenantId);
		await this.dataSource.transaction(async (manager) => {
			const program = await lockClientProgram(
				manager,
				activeTenantId,
				programId,
			);
			program.isArchived = true;
			await manager.getRepository(Program).save(program);
		});

		return { message: 'Client program archived' };
	}
}

async function lockClientProgram(
	manager: EntityManager,
	tenantId: string,
	programId: string,
) {
	const program = await manager
		.getRepository(Program)
		.createQueryBuilder('program')
		.innerJoinAndSelect('program.tenant', 'tenant')
		.where('program.id = :programId', { programId })
		.andWhere('program.tenant_id = :tenantId', { tenantId })
		.andWhere('program.program_type = :programType', {
			programType: ProgramType.CLIENT,
		})
		.setLock('pessimistic_write')
		.getOne();
	if (!program) {
		throw new NotFoundException('Client program not found');
	}
	return program;
}

async function lockActiveMembership(
	manager: EntityManager,
	tenantId: string,
	membershipId: string,
) {
	const membership = await manager
		.getRepository(ClientMembership)
		.createQueryBuilder('membership')
		.innerJoin('membership.tenant', 'tenant')
		.innerJoin('membership.client', 'client')
		.where('membership.id = :membershipId', { membershipId })
		.andWhere('tenant.id = :tenantId', { tenantId })
		.andWhere('membership.status = :status', {
			status: MembershipStatus.ACTIVE,
		})
		.setLock('pessimistic_write')
		.getOne();
	if (!membership) {
		throw new NotFoundException('Active client membership not found');
	}
	return membership;
}

async function assertProgramCompleteness(
	manager: EntityManager,
	program: Program,
) {
	const days = await manager
		.getRepository(ProgramDay)
		.createQueryBuilder('day')
		.innerJoin('day.programWeek', 'week')
		.leftJoin('day.exercises', 'exercise')
		.select('day.id', 'id')
		.addSelect('day.is_rest_day', 'isRestDay')
		.addSelect('COUNT(exercise.id)', 'exerciseCount')
		.where('week.program_id = :programId', { programId: program.id })
		.andWhere('day.tenant_id = :tenantId', { tenantId: program.tenantId })
		.groupBy('day.id')
		.addGroupBy('day.is_rest_day')
		.getRawMany<PublishableDay>();

	const expectedDayCount = program.durationWeeks * 7;
	if (days.length !== expectedDayCount) {
		throw new BadRequestException(
			`Client program must contain exactly ${expectedDayCount} days`,
		);
	}

	for (const day of days) {
		const exerciseCount = Number(day.exerciseCount);
		if (day.isRestDay && exerciseCount > 0) {
			throw new ConflictException('Rest days cannot contain planned exercises');
		}
		if (!day.isRestDay && exerciseCount === 0) {
			throw new BadRequestException(
				'Every program day must be marked as rest or contain at least one exercise',
			);
		}
	}
}

async function assertNoPublishedOverlap(
	manager: EntityManager,
	program: Program,
) {
	const overlap = await manager
		.getRepository(Program)
		.createQueryBuilder('overlap')
		.where('overlap.tenant_id = :tenantId', { tenantId: program.tenantId })
		.andWhere('overlap.membership_id = :membershipId', {
			membershipId: program.membershipId,
		})
		.andWhere('overlap.program_type = :programType', {
			programType: ProgramType.CLIENT,
		})
		.andWhere('overlap.status = :status', {
			status: ProgramStatus.PUBLISHED,
		})
		.andWhere('overlap.id <> :programId', { programId: program.id })
		.andWhere('overlap.start_date <= :endDate', {
			endDate: program.endDate,
		})
		.andWhere('overlap.end_date >= :startDate', {
			startDate: program.startDate,
		})
		.getOne();
	if (overlap) {
		throw new ConflictException(
			'Published client program dates overlap another program for this membership',
		);
	}
}
