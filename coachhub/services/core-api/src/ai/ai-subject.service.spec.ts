import { Repository } from 'typeorm';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { MembershipStatus } from '../common';
import { WsPrincipal } from '../auth/services/ws-auth.service';
import { AiSubjectService } from './ai-subject.service';

const TENANT = 'tenant-1';
const MEMBERSHIP = 'membership-1';

const COACH: WsPrincipal = {
	tenantId: TENANT,
	email: 'coach@example.com',
	coachId: 'coach-1',
	clientId: null,
};

const CLIENT: WsPrincipal = {
	tenantId: TENANT,
	email: 'client@example.com',
	coachId: null,
	clientId: 'client-1',
};

describe('AiSubjectService', () => {
	let repository: { findOne: jest.Mock };
	let service: AiSubjectService;

	beforeEach(() => {
		repository = { findOne: jest.fn().mockResolvedValue({ id: MEMBERSHIP }) };
		service = new AiSubjectService(
			repository as unknown as Repository<ClientMembership>,
		);
	});

	describe('a coach', () => {
		it('may ask about a membership in their own tenant', async () => {
			const subject = await service.resolve(COACH, MEMBERSHIP);

			expect(subject).toEqual({ id: MEMBERSHIP });
			// The tenant clause is the authorization: without it any uuid would do.
			expect(repository.findOne).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: MEMBERSHIP, tenant: { id: TENANT } },
				}),
			);
		});

		it('gets nothing for a membership outside their tenant', async () => {
			repository.findOne.mockResolvedValue(null);

			await expect(service.resolve(COACH, MEMBERSHIP)).resolves.toBeNull();
		});

		it('asks about nobody when no membership is named', async () => {
			await expect(service.resolve(COACH, null)).resolves.toBeNull();
			expect(repository.findOne).not.toHaveBeenCalled();
		});
	});

	describe('a client', () => {
		// The attack this exists to stop: naming another client of the same coach.
		it('is scoped to themselves however they ask', async () => {
			const subject = await service.resolve(CLIENT, 'someone-elses-membership');

			expect(subject).toEqual({ id: MEMBERSHIP });
			expect(repository.findOne).toHaveBeenCalledWith(
				expect.objectContaining({
					where: {
						tenant: { id: TENANT },
						client: { id: CLIENT.clientId },
						status: MembershipStatus.ACTIVE,
					},
				}),
			);
		});

		it('never has the supplied id reach the query at all', async () => {
			await service.resolve(CLIENT, 'someone-elses-membership');

			const where = repository.findOne.mock.calls[0][0].where;
			expect(JSON.stringify(where)).not.toContain('someone-elses-membership');
		});

		it('resolves to nobody when their membership is not active', async () => {
			repository.findOne.mockResolvedValue(null);

			await expect(service.resolve(CLIENT, null)).resolves.toBeNull();
		});
	});
});
