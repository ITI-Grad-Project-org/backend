import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MembershipStatus } from '../common';
import { ClientMembership } from './entities/client-membership.entity';

@Injectable()
export class ClientMembershipService {
	constructor(
		@InjectRepository(ClientMembership)
		private readonly membershipRepository: Repository<ClientMembership>,
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
}
