import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { MembershipStatus } from '../common';
import { WsPrincipal } from '../auth/services/ws-auth.service';

/**
 * Decides which client an assistant question is allowed to be about.
 *
 * <h2>Why this is its own service</h2>
 *
 * The answer is retrieved from that client's private material — their
 * check-ins, in their words, with the coach's replies. Getting this wrong does
 * not produce a bad answer, it produces one client's notes read out to
 * another. It is the only security decision in the chat path, so it lives
 * somewhere it can be read and tested on its own rather than inline in a
 * socket handler.
 *
 * <h2>The two rules</h2>
 *
 * A **coach** owns the tenant, so they may ask about any membership in it —
 * but
 * the membership is verified against their tenant, never trusted from the
 * message.
 *
 * A **client** may only ever ask about themselves. Any `membershipId` in their
 * message is ignored outright rather than validated: there is no version of
 * that field from a client that means anything, and accepting it even to
 * reject it invites the check to be loosened later.
 */
@Injectable()
export class AiSubjectService {
	constructor(
		@InjectRepository(ClientMembership)
		private readonly membershipRepository: Repository<ClientMembership>,
	) {}

	/**
	 * @returns the membership the question may be scoped to, or null for a
	 *   question about nobody in particular — which retrieves only material tied
	 *   to no client.
	 * @throws never; an unresolvable subject returns null so the question is
	 *   still answered, just without private context.
	 */
	async resolve(
		principal: WsPrincipal,
		requestedMembershipId: string | null,
	): Promise<ClientMembership | null> {
		if (principal.clientId) {
			return this.findOwnMembership(principal.tenantId, principal.clientId);
		}
		if (!requestedMembershipId) {
			return null;
		}
		return this.findMembershipInTenant(
			principal.tenantId,
			requestedMembershipId,
		);
	}

	/** A client's own membership in the tenant they are connected to. */
	private findOwnMembership(tenantId: string, clientId: string) {
		return this.membershipRepository.findOne({
			where: {
				tenant: { id: tenantId },
				client: { id: clientId },
				status: MembershipStatus.ACTIVE,
			},
			select: { id: true },
		});
	}

	/**
	 * The tenant clause is the authorization. Without it a coach could read any
	 * client in the system by guessing an uuid.
	 */
	private findMembershipInTenant(tenantId: string, membershipId: string) {
		return this.membershipRepository.findOne({
			where: { id: membershipId, tenant: { id: tenantId } },
			select: { id: true },
		});
	}
}
