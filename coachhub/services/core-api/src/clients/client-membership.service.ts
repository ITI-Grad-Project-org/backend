import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ClientMembership } from './entities/client-membership.entity';
import { MembershipStatus } from '../common';

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

	/**
	 * Client-initiated counterpart to an invitation. `(tenant, client)` is
	 * unique and soft-deleted rows keep occupying that pair, so a client who was
	 * rejected or removed earlier already has a row: revive it rather than
	 * inserting a second one, which the database would refuse.
	 */
	async requestToJoin(
		clientId: string,
		tenantId: string,
		message: string | null,
	): Promise<ClientMembership> {
		const existing = await this.membershipRepository.findOne({
			where: { client: { id: clientId }, tenant: { id: tenantId } },
			relations: { tenant: true, client: true },
			withDeleted: true,
		});

		if (existing) {
			this.assertRequestable(existing);

			existing.status = MembershipStatus.REQUESTED;
			existing.requestMessage = message;
			existing.decidedAt = null;
			existing.deletedAt = null;
			return this.membershipRepository.save(existing);
		}

		const membership = this.membershipRepository.create({
			client: { id: clientId },
			tenant: { id: tenantId },
			status: MembershipStatus.REQUESTED,
			requestMessage: message,
			joinedAt: null,
		});
		return this.membershipRepository.save(membership);
	}

	private assertRequestable(membership: ClientMembership) {
		if (membership.status === MembershipStatus.BLOCKED) {
			throw new ForbiddenException(
				'You cannot request to train with this coach',
			);
		}
		if (membership.status === MembershipStatus.REQUESTED) {
			throw new BadRequestException(
				'You already have a pending request with this coach',
			);
		}
		if (membership.status === MembershipStatus.INVITED) {
			throw new BadRequestException(
				'This coach has already invited you — accept the invitation instead',
			);
		}
		if (
			!membership.deletedAt &&
			[
				MembershipStatus.ACTIVE,
				MembershipStatus.PAUSED,
				MembershipStatus.ARCHIVED,
			].includes(membership.status)
		) {
			throw new BadRequestException('You are already a member of this coach');
		}
	}

	findClientRequests(clientId: string): Promise<ClientMembership[]> {
		return this.membershipRepository.find({
			where: {
				client: { id: clientId },
				status: In([MembershipStatus.REQUESTED, MembershipStatus.REJECTED]),
			},
			relations: { tenant: true },
			order: { createdAt: 'DESC' },
		});
	}

	findTenantRequests(tenantId: string): Promise<ClientMembership[]> {
		return this.membershipRepository.find({
			where: {
				tenant: { id: tenantId },
				status: MembershipStatus.REQUESTED,
			},
			relations: { client: true },
			order: { createdAt: 'ASC' },
		});
	}

	/**
	 * Loads a request that is still pending, scoped to the coach's own tenant so
	 * one coach cannot act on another's queue.
	 */
	async findPendingRequest(
		tenantId: string,
		membershipId: string,
	): Promise<ClientMembership> {
		const membership = await this.membershipRepository.findOne({
			where: {
				id: membershipId,
				tenant: { id: tenantId },
				status: MembershipStatus.REQUESTED,
			},
			relations: { client: true, tenant: true },
		});

		if (!membership) {
			throw new NotFoundException('Pending request not found in this tenant');
		}
		return membership;
	}

	decideRequest(membership: ClientMembership, approved: boolean) {
		membership.status = approved
			? MembershipStatus.ACTIVE
			: MembershipStatus.REJECTED;
		membership.joinedAt = approved ? new Date() : null;
		membership.decidedAt = new Date();
		return this.membershipRepository.save(membership);
	}

	async withdrawRequest(clientId: string, membershipId: string) {
		const membership = await this.membershipRepository.findOne({
			where: {
				id: membershipId,
				client: { id: clientId },
				status: MembershipStatus.REQUESTED,
			},
		});

		if (!membership) {
			throw new NotFoundException('Pending request not found');
		}

		await this.membershipRepository.softDelete(membership.id);
		return { message: 'Request withdrawn' };
	}
}
