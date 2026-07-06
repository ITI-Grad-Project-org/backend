import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MembershipStatus } from '../common';
import { LogMeasurementDto } from '../measurements/dto/log-measurement.dto';
import { Measurement } from '../measurements/entities/measurement.entity';
import { UpdateClientMembershipProfileDto } from './dto/update-client-membership-profile.dto';
import { ClientIntake } from './entities/client-intake.entity';
import { ClientMembership } from './entities/client-membership.entity';

@Injectable()
export class ClientMembershipService {
	constructor(
		@InjectRepository(ClientMembership)
		private readonly membershipRepository: Repository<ClientMembership>,
		@InjectRepository(ClientIntake)
		private readonly intakeRepository: Repository<ClientIntake>,
		@InjectRepository(Measurement)
		private readonly measurementRepository: Repository<Measurement>,
	) {}

	findMemberships(clientId: string): Promise<ClientMembership[]> {
		return this.membershipRepository.find({
			where: { client: { id: clientId } },
			relations: { tenant: true },
			order: { lastActiveAt: 'DESC', createdAt: 'DESC' },
		});
	}

	findMembership(
		clientId: string,
		tenantId: string,
	): Promise<ClientMembership | null> {
		return this.membershipRepository.findOne({
			where: { client: { id: clientId }, tenant: { id: tenantId } },
			relations: { tenant: true, client: true },
		});
	}

	findById(membershipId: string): Promise<ClientMembership | null> {
		return this.membershipRepository.findOne({
			where: { id: membershipId },
			relations: { tenant: true, client: true },
		});
	}

	findTenantMembers(tenantId: string): Promise<ClientMembership[]> {
		return this.membershipRepository.find({
			where: { tenant: { id: tenantId } },
			relations: { client: true },
			order: { createdAt: 'DESC' },
		});
	}

	findTenantMember(
		tenantId: string,
		clientId: string,
	): Promise<ClientMembership | null> {
		return this.membershipRepository.findOne({
			where: { tenant: { id: tenantId }, client: { id: clientId } },
			relations: { client: true, tenant: true },
		});
	}

	removeFromTenant(membershipId: string) {
		return this.membershipRepository.softDelete(membershipId);
	}

	async updateClientOwnTenantProfile(
		clientId: string,
		tenantId: string,
		dto: UpdateClientMembershipProfileDto,
	) {
		const membership = await this.findMembership(clientId, tenantId);
		if (!membership) {
			return null;
		}

		const { measurement, ...intakeDto } = dto;
		const intake = await this.upsertIntake(membership, intakeDto);
		const savedMeasurement = measurement
			? await this.upsertMeasurement(membership, measurement)
			: null;

		return {
			membership,
			intake,
			measurement: savedMeasurement,
		};
	}

	async resolveDefaultTenantId(clientId: string): Promise<string | null> {
		const membership = await this.membershipRepository.findOne({
			where: { client: { id: clientId }, status: MembershipStatus.ACTIVE },
			relations: { tenant: true },
			order: { lastActiveAt: 'DESC', createdAt: 'DESC' },
		});

		return membership?.tenant?.id ?? null;
	}

	async createMembership(
		clientId: string,
		tenantId: string,
		status: MembershipStatus = MembershipStatus.INVITED,
	): Promise<ClientMembership> {
		const existing = await this.findMembership(clientId, tenantId);
		if (existing) {
			throw new BadRequestException(
				'Client is already a member of this tenant',
			);
		}

		const membership = this.membershipRepository.create({
			client: { id: clientId },
			tenant: { id: tenantId },
			status,
			joinedAt: status === MembershipStatus.ACTIVE ? new Date() : null,
		});
		return this.membershipRepository.save(membership);
	}

	markActiveNow(membershipId: string) {
		return this.membershipRepository.update(membershipId, {
			lastActiveAt: new Date(),
		});
	}

	private async upsertIntake(
		membership: ClientMembership,
		dto: Omit<UpdateClientMembershipProfileDto, 'measurement'>,
	) {
		if (!Object.keys(dto).length) {
			return this.intakeRepository.findOne({
				where: { membership: { id: membership.id } },
			});
		}

		const existing = await this.intakeRepository.findOne({
			where: { membership: { id: membership.id } },
		});
		const intake = existing ?? this.intakeRepository.create({
			membership: { id: membership.id },
			tenant: { id: membership.tenant.id },
		});

		Object.assign(intake, dto);
		return this.intakeRepository.save(intake);
	}

	private async upsertMeasurement(
		membership: ClientMembership,
		dto: Omit<LogMeasurementDto, 'membershipId'>,
	) {
		const measuredAt = dto.measuredAt ?? new Date().toISOString().slice(0, 10);
		const existing = await this.measurementRepository.findOne({
			where: {
				membership: { id: membership.id },
				measuredAt,
			},
		});
		const measurement = existing ?? this.measurementRepository.create({
			membership: { id: membership.id },
			membershipId: membership.id,
			tenant: { id: membership.tenant.id },
			tenantId: membership.tenant.id,
			measuredAt,
		});

		Object.assign(measurement, {
			...dto,
			measuredAt,
		});
		return this.measurementRepository.save(measurement);
	}
}
