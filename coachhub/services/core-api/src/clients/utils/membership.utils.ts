import { Gender, MembershipStatus } from '../../common';
import { ClientMembership } from '../entities/client-membership.entity';

/**
 * One row of a coach's client roster.
 *
 * `membershipId` is named rather than left as `id` because it is the id every
 * other coach-facing endpoint wants — plan suggestions, measurements, programs
 * and nutrition plans are all keyed on the membership, not on the client. A
 * field called `id` sitting next to `client.id` is an invitation to send the
 * wrong one.
 */
export interface MembershipSummary {
	membershipId: string;
	status: MembershipStatus;
	/** Whether an intake questionnaire exists; AI plans are much weaker without one. */
	hasIntake: boolean;
	client: {
		id: string;
		firstName: string;
		lastName: string;
		email: string;
		phone: string | null;
		avatarUrl: string | null;
		timezone: string;
		gender: Gender | null;
	};
	monthlyPrice: number | null;
	currency: string;
	blockReason: string | null;
	requestMessage: string | null;
	joinedAt: Date | null;
	lastActiveAt: Date | null;
	decidedAt: Date | null;
	createdAt: Date;
}

export function toMembershipSummary(
	membership: ClientMembership,
	hasIntake: boolean,
): MembershipSummary {
	const client = membership.client;
	return {
		membershipId: membership.id,
		status: membership.status,
		hasIntake,
		client: {
			id: client?.id ?? '',
			firstName: client?.firstName ?? '',
			lastName: client?.lastName ?? '',
			email: client?.email ?? '',
			phone: client?.phone ?? null,
			avatarUrl: client?.avatarUrl ?? null,
			timezone: client?.timezone ?? 'UTC',
			gender: client?.gender ?? null,
		},
		monthlyPrice: membership.monthlyPrice,
		currency: membership.currency,
		blockReason: membership.blockReason,
		requestMessage: membership.requestMessage,
		joinedAt: membership.joinedAt,
		lastActiveAt: membership.lastActiveAt,
		decidedAt: membership.decidedAt,
		createdAt: membership.createdAt,
	};
}
