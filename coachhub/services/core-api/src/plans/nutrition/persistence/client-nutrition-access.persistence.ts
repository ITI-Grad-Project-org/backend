import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ClientMembership } from '../../../clients/entities/client-membership.entity';
import { MembershipStatus } from '../../../common';

/**
 * Resolves the authenticated client inside one tenant. Keeping this query
 * shared prevents schedule and logging flows from drifting on tenant checks.
 */
export async function findActiveClientNutritionMembership(
	repository: Repository<ClientMembership>,
	clientId: string,
	tenantId: string,
) {
	const membership = await repository.findOne({
		where: {
			tenant: { id: tenantId },
			client: { id: clientId },
			status: MembershipStatus.ACTIVE,
		},
		relations: { tenant: true },
	});
	if (!membership) {
		throw new NotFoundException('Active client membership not found');
	}
	return membership;
}
