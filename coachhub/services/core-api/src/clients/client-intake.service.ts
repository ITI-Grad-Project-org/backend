import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { MembershipStatus } from '../common';
import { CreateClientIntakeDto } from './dto/create-client-intake.dto';
import { UpdateClientIntakeDto } from './dto/update-client-intake.dto';
import { ClientIntake } from './entities/client-intake.entity';
import { ClientMembership } from './entities/client-membership.entity';

@Injectable()
export class ClientIntakeService {
	constructor(
		@InjectRepository(ClientIntake)
		private readonly intakeRepository: Repository<ClientIntake>,
		@InjectRepository(ClientMembership)
		private readonly membershipRepository: Repository<ClientMembership>,
	) {}

	async createClientIntake(
		clientId: string,
		tenantId: string | null,
		dto: CreateClientIntakeDto,
	) {
		const membership = await this.resolveActiveMembership(clientId, tenantId);
		const existingIntake = await this.findMembershipIntake(membership.id);

		if (existingIntake) {
			throw new ConflictException('Client intake already exists');
		}

		const intake = this.intakeRepository.create({
			...dto,
			tenant: { id: membership.tenant.id },
			membership: { id: membership.id },
		});

		try {
			return await this.intakeRepository.save(intake);
		} catch (error) {
			this.throwConflictForUniqueViolation(
				error,
				'Client intake already exists',
			);
			throw error;
		}
	}
	async getClientIntake(clientId: string, tenantId: string | null) {
		const membership = await this.resolveActiveMembership(clientId, tenantId);
		const intake = await this.findMembershipIntake(membership.id);

		if (!intake) {
			throw new NotFoundException('Client intake not found');
		}

		return intake;
	}

	async updateClientIntake(
		clientId: string,
		tenantId: string | null,
		dto: UpdateClientIntakeDto,
	) {
		const membership = await this.resolveActiveMembership(clientId, tenantId);
		const intake = await this.findMembershipIntake(membership.id);

		if (!intake) {
			throw new NotFoundException('Client intake not found');
		}

		Object.assign(intake, dto);
		return this.intakeRepository.save(intake);
	}

	async deleteClientIntake(clientId: string, tenantId: string | null) {
		const membership = await this.resolveActiveMembership(clientId, tenantId);
		const intake = await this.findMembershipIntake(membership.id);

		if (!intake) {
			throw new NotFoundException('Client intake not found');
		}

		await this.intakeRepository.delete(intake.id);
		return { message: 'Client intake deleted' };
	}

	private async resolveActiveMembership(
		clientId: string,
		tenantId: string | null,
	) {
		if (!tenantId) {
			throw new BadRequestException('No active tenant selected');
		}
		const membership = await this.membershipRepository.findOne({
			where: {
				client: { id: clientId },
				tenant: { id: tenantId },
				status: MembershipStatus.ACTIVE,
			},
			relations: { tenant: true, client: true },
		});

		if (!membership) {
			throw new NotFoundException('Active client membership not found');
		}

		return membership;
	}

	private findMembershipIntake(membershipId: string) {
		return this.intakeRepository.findOne({
			where: { membership: { id: membershipId } },
			relations: { membership: true, tenant: true },
		});
	}

	private throwConflictForUniqueViolation(error: unknown, message: string) {
		if (
			error instanceof QueryFailedError &&
			(error.driverError as { code?: string } | undefined)?.code === '23505'
		) {
			throw new ConflictException(message);
		}
	}
}
