import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository }                from '@nestjs/typeorm';
import { Repository }                      from 'typeorm';
import {
	ClientMembership
}                                          from './entities/client-membership.entity';
import { UserStatus }                      from '../auth';

@Injectable()
export class ClientMembershipService {
	constructor (
		@InjectRepository( ClientMembership )
		private readonly membershipRepository: Repository<ClientMembership>,
	) {}

	findMemberships ( clientId: number ): Promise<ClientMembership[]> {
		return this.membershipRepository.find( {
			where: { client: { id: clientId } },
			relations: { tenant: true },
			order: { lastActiveAt: 'DESC', invitedAt: 'DESC' },
		} );
	}

	findMembership (
		clientId: number,
		tenantId: number,
	): Promise<ClientMembership | null> {
		return this.membershipRepository.findOne( {
			where: { client: { id: clientId }, tenant: { id: tenantId } },
			relations: { tenant: true },
		} );
	}

	findTenantMembers ( tenantId: number ): Promise<ClientMembership[]> {
		return this.membershipRepository.find( {
			where: { tenant: { id: tenantId } },
			relations: { client: true },
			order: { invitedAt: 'DESC' },
		} );
	}

	findTenantMember (
		tenantId: number,
		clientId: number,
	): Promise<ClientMembership | null> {
		return this.membershipRepository.findOne( {
			where: { tenant: { id: tenantId }, client: { id: clientId } },
			relations: { client: true },
		} );
	}

	removeFromTenant ( membershipId: number ) {
		return this.membershipRepository.softDelete( membershipId );
	}

	async resolveDefaultTenantId ( clientId: number ): Promise<number | null> {
		const membership = await this.membershipRepository.findOne( {
			where: { client: { id: clientId }, status: UserStatus.ACTIVE },
			relations: { tenant: true },
			order: { lastActiveAt: 'DESC', invitedAt: 'DESC' },
		} );

		return membership?.tenant?.id ?? null;
	}

	async createMembership (
		clientId: number,
		tenantId: number,
		status: UserStatus = UserStatus.PENDING,
	): Promise<ClientMembership> {
		const existing = await this.findMembership( clientId, tenantId );
		if ( existing ) {
			throw new BadRequestException(
				'Client is already a member of this tenant',
			);
		}

		const membership = this.membershipRepository.create( {
			client: { id: clientId },
			tenant: { id: tenantId },
			status,
			joinedAt: status === UserStatus.ACTIVE ? new Date() : null,
		} );
		return this.membershipRepository.save( membership );
	}

	markActiveNow ( membershipId: number ) {
		return this.membershipRepository.update( membershipId, {
			lastActiveAt: new Date(),
		} );
	}
}
