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

	/**
	 * Approval no longer activates immediately: the membership waits in `INVITED`
	 * holding a hashed code, and only `activateInvited` (after the client types
	 * the code) flips it to `ACTIVE`. Symmetric with the coach-invite flow.
	 */
	approveWithOtp(
		membership: ClientMembership,
		otpHash: string,
		otpExpires: Date,
	) {
		membership.status = MembershipStatus.INVITED;
		membership.joinedAt = null;
		membership.decidedAt = new Date();
		membership.inviteOtpHash = otpHash;
		membership.inviteOtpExpires = otpExpires;
		membership.inviteOtpAttempts = 0;
		return this.membershipRepository.save(membership);
	}

	rejectRequest(membership: ClientMembership) {
		membership.status = MembershipStatus.REJECTED;
		membership.joinedAt = null;
		membership.decidedAt = new Date();
		return this.membershipRepository.save(membership);
	}

	/** Approved-but-unconfirmed memberships for a client, with the hidden OTP columns. */
	findInvitedWithOtp(clientId: string): Promise<ClientMembership[]> {
		return this.membershipRepository
			.createQueryBuilder('membership')
			.leftJoin('membership.client', 'client')
			.leftJoinAndSelect('membership.tenant', 'tenant')
			.leftJoinAndSelect('tenant.ownerCoach', 'ownerCoach')
			.addSelect([
				'membership.inviteOtpHash',
				'membership.inviteOtpExpires',
				'membership.inviteOtpAttempts',
			])
			.where('client.id = :clientId', { clientId })
			.andWhere('membership.status = :status', {
				status: MembershipStatus.INVITED,
			})
			.getMany();
	}

	/** The client typed the right code: activate and burn the code. */
	activateInvited(membership: ClientMembership) {
		membership.status = MembershipStatus.ACTIVE;
		membership.joinedAt = new Date();
		membership.inviteOtpHash = null;
		membership.inviteOtpExpires = null;
		membership.inviteOtpAttempts = 0;
		return this.membershipRepository.save(membership);
	}

	async incrementInviteOtpAttempts(membershipIds: string[]): Promise<void> {
		if (membershipIds.length === 0) {
			return;
		}
		await this.membershipRepository.increment(
			{ id: In(membershipIds) },
			'inviteOtpAttempts',
			1,
		);
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
