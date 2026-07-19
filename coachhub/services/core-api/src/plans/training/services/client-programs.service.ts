import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import { MembershipStatus, ProgramStatus, ProgramType } from '../../../common';
import { Tenant } from '../../../tenant/entities/tenant.entity';
import {
	CreateClientProgramDto,
	UpdateClientProgramDto,
} from '../dto/create-client-program.dto';
import { QueryClientProgramsDto } from '../dto/query-client-programs.dto';
import { ProgramDay } from '../entities/program-day.entity';
import { ProgramWeek } from '../entities/program-week.entity';
import { Program } from '../entities/program.entity';
import { deriveInclusiveEndDate } from '../utils/program-date.utils';
import {
	assertActiveTenant,
	assertStartDate,
	mapBuilderProgram,
	mapClientProgramSummary,
	normalizeOptionalText,
} from '../utils/training-service.utils';

@Injectable()
export class ClientProgramsService {
	constructor(
		@InjectRepository(Program)
		private readonly programRepository: Repository<Program>,
		private readonly dataSource: DataSource,
	) {}

	async createClientProgram(
		tenantId: string | null,
		coachId: string,
		body: CreateClientProgramDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);

		return this.dataSource.transaction(async (manager) => {
			const tenant = await manager.getRepository(Tenant).findOneBy({
				id: activeTenantId,
			});
			if (!tenant) {
				throw new NotFoundException('Tenant not found');
			}

			const membership = await manager.getRepository(ClientMembership).findOne({
				where: {
					id: body.membershipId,
					tenant: { id: activeTenantId },
					status: MembershipStatus.ACTIVE,
				},
				relations: { client: true },
			});
			if (!membership?.client) {
				throw new NotFoundException('Active client membership not found');
			}

			assertStartDate(body.startDate, tenant.timezone);

			const programRepository = manager.getRepository(Program);
			const weekRepository = manager.getRepository(ProgramWeek);
			const dayRepository = manager.getRepository(ProgramDay);
			const weeks = Array.from({ length: body.durationWeeks }, (_, weekIndex) =>
				weekRepository.create({
					tenantId: activeTenantId,
					weekNumber: weekIndex + 1,
					notes: null,
					days: Array.from({ length: 7 }, (_, dayIndex) =>
						dayRepository.create({
							tenantId: activeTenantId,
							dayNumber: dayIndex + 1,
							name: null,
							isRestDay: false,
							notes: null,
						}),
					),
				}),
			);
			const program = programRepository.create({
				tenantId: activeTenantId,
				createdBy: { id: coachId },
				programType: ProgramType.CLIENT,
				membershipId: membership.id,
				membership: { id: membership.id },
				sourceTemplateId: null,
				sourceTemplate: null,
				name: body.name.trim(),
				description: normalizeOptionalText(body.description),
				goal: body.goal ?? null,
				difficulty: body.difficulty ?? null,
				durationWeeks: body.durationWeeks,
				startDate: body.startDate,
				endDate: deriveInclusiveEndDate(body.startDate, body.durationWeeks),
				status: ProgramStatus.DRAFT,
				isArchived: false,
				weeks,
			});

			const savedProgram = await programRepository.save(program);
			return mapBuilderProgram(savedProgram, tenant.timezone);
		});
	}

	async findClientPrograms(
		tenantId: string | null,
		query: QueryClientProgramsDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		const programsQuery = this.programRepository
			.createQueryBuilder('program')
			.where('program.tenant_id = :tenantId', { tenantId: activeTenantId })
			.andWhere('program.program_type = :programType', {
				programType: ProgramType.CLIENT,
			})
			.andWhere('program.is_archived = :isArchived', {
				isArchived: query.isArchived ?? false,
			})
			.orderBy('program.created_at', 'DESC');

		if (query.membershipId) {
			programsQuery.andWhere('program.membership_id = :membershipId', {
				membershipId: query.membershipId,
			});
		}
		if (query.status) {
			programsQuery.andWhere('program.status = :status', {
				status: query.status,
			});
		}
		if (query.goal) {
			programsQuery.andWhere('program.goal = :goal', { goal: query.goal });
		}
		if (query.difficulty) {
			programsQuery.andWhere('program.difficulty = :difficulty', {
				difficulty: query.difficulty,
			});
		}
		if (query.search?.trim()) {
			programsQuery.andWhere('program.name ILIKE :search', {
				search: `%${query.search.trim()}%`,
			});
		}

		const [programs, tenant] = await Promise.all([
			programsQuery.getMany(),
			this.dataSource.getRepository(Tenant).findOneBy({ id: activeTenantId }),
		]);
		if (!tenant) {
			throw new NotFoundException('Tenant not found');
		}
		return programs.map((program) =>
			mapClientProgramSummary(program, tenant.timezone),
		);
	}

	async getClientProgram(tenantId: string | null, programId: string) {
		const activeTenantId = assertActiveTenant(tenantId);
		const program = await this.programRepository.findOne({
			where: {
				id: programId,
				tenantId: activeTenantId,
				programType: ProgramType.CLIENT,
			},
			relations: {
				weeks: {
					days: {
						exercises: { sets: true },
					},
				},
			},
			order: {
				weeks: {
					weekNumber: 'ASC',
					days: {
						dayNumber: 'ASC',
						exercises: {
							position: 'ASC',
							sets: { setNumber: 'ASC' },
						},
					},
				},
			},
		});

		if (!program) {
			throw new NotFoundException('Client program not found');
		}

		const tenant = await this.dataSource
			.getRepository(Tenant)
			.findOneBy({ id: activeTenantId });
		if (!tenant) {
			throw new NotFoundException('Tenant not found');
		}

		return mapBuilderProgram(program, tenant.timezone);
	}

	async updateClientProgram(
		tenantId: string | null,
		programId: string,
		body: UpdateClientProgramDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		const program = await this.programRepository.findOne({
			where: {
				id: programId,
				tenantId: activeTenantId,
				programType: ProgramType.CLIENT,
			},
			relations: { tenant: true },
		});

		if (!program) {
			throw new NotFoundException('Client program not found');
		}
		if (program.status !== ProgramStatus.DRAFT) {
			throw new ConflictException('Only draft client programs can be edited');
		}

		if (body.name !== undefined) {
			program.name = body.name.trim();
		}
		if (body.description !== undefined) {
			program.description = normalizeOptionalText(body.description);
		}
		if (body.goal !== undefined) {
			program.goal = body.goal;
		}
		if (body.difficulty !== undefined) {
			program.difficulty = body.difficulty;
		}
		if (body.startDate !== undefined) {
			assertStartDate(body.startDate, program.tenant.timezone);
			program.startDate = body.startDate;
			program.endDate = deriveInclusiveEndDate(
				body.startDate,
				program.durationWeeks,
			);
		}

		await this.programRepository.save(program);
		return this.getClientProgram(activeTenantId, program.id);
	}
}
