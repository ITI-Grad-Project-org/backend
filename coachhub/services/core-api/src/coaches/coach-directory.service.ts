import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Tenant } from '../tenant/entities/tenant.entity';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { MembershipStatus } from '../common';
import { QueryDirectoryDto } from './dto/query-directory.dto';

/**
 * Read model for clients browsing coaches. A coach is only reachable through
 * the tenant they own, so the directory is a query over discoverable tenants
 * joined to their owner. Everything here is served to people outside the
 * tenant, so the projection is an explicit allow-list — never the raw entity,
 * which carries contact details and verification flags.
 */
@Injectable()
export class CoachDirectoryService {
	constructor(
		@InjectRepository(Tenant)
		private readonly tenantRepository: Repository<Tenant>,
		@InjectRepository(ClientMembership)
		private readonly membershipRepository: Repository<ClientMembership>,
	) {}

	async browse(dto: QueryDirectoryDto, clientId: string) {
		const page = dto.page ?? 1;
		const limit = dto.limit ?? 20;

		const query = this.tenantRepository
			.createQueryBuilder('tenant')
			.innerJoin('tenant.ownerCoach', 'coach')
			.where('tenant.acceptingClients = true')
			.andWhere('coach.deletedAt IS NULL')
			.select([
				'tenant.id',
				'tenant.name',
				'tenant.slug',
				'tenant.logoUrl',
				'coach.id',
				'coach.firstName',
				'coach.lastName',
				'coach.avatarUrl',
				'coach.bio',
				'coach.specialties',
				'coach.yearsExperience',
				'coach.certifications',
				'coach.socialLinks',
				'coach.location',
				'coach.offlineAvailability',
				'coach.priceFrom',
				'coach.priceTo',
			])
			.orderBy('coach.yearsExperience', 'DESC', 'NULLS LAST')
			.addOrderBy('tenant.name', 'ASC')
			.skip((page - 1) * limit)
			.take(limit);

		if (dto.search) {
			query.andWhere(
				`(coach.firstName ILIKE :search OR coach.lastName ILIKE :search OR tenant.name ILIKE :search)`,
				{ search: `%${dto.search}%` },
			);
		}

		if (dto.specialty) {
			query.andWhere(
				'coach.specialties && ARRAY[:specialty]::coach_specialty[]',
				{ specialty: dto.specialty },
			);
		}

		const [tenants, total] = await query.getManyAndCount();
		const statuses = await this.relationshipStatuses(
			clientId,
			tenants.map((tenant) => tenant.id),
		);

		return {
			data: tenants.map((tenant) => this.toCard(tenant, statuses)),
			meta: { page, limit, total, pages: Math.ceil(total / limit) },
		};
	}

	async findOne(tenantId: string, clientId: string) {
		const tenant = await this.tenantRepository
			.createQueryBuilder('tenant')
			.innerJoin('tenant.ownerCoach', 'coach')
			.where('tenant.id = :tenantId', { tenantId })
			.andWhere('tenant.acceptingClients = true')
			.andWhere('coach.deletedAt IS NULL')
			.select([
				'tenant.id',
				'tenant.name',
				'tenant.slug',
				'tenant.logoUrl',
				'tenant.timezone',
				'coach.id',
				'coach.firstName',
				'coach.lastName',
				'coach.avatarUrl',
				'coach.bio',
				'coach.specialties',
				'coach.yearsExperience',
				'coach.certifications',
				'coach.socialLinks',
				'coach.location',
				'coach.offlineAvailability',
				'coach.priceFrom',
				'coach.priceTo',
				'coach.age',
				'coach.gender',
				'coach.careerExperience',
				'coach.portfolioUrl',
				'coach.transformationPhotos',
				'coach.featuredReviews',
				'coach.availabilityHours',
			])
			.getOne();

		if (!tenant) {
			throw new NotFoundException('Coach not found');
		}

		const statuses = await this.relationshipStatuses(clientId, [tenant.id]);
		const card = this.toCard(tenant, statuses);
		const coach = tenant.ownerCoach;

		return {
			...card,
			timezone: tenant.timezone,
			coach: {
				...card.coach,
				age: coach.age,
				gender: coach.gender,
				careerExperience: coach.careerExperience,
				portfolioUrl: coach.portfolioUrl,
				transformationPhotos: coach.transformationPhotos,
				featuredReviews: coach.featuredReviews,
				availabilityHours: coach.availabilityHours,
			},
		};
	}

	/**
	 * One lookup for the whole page so the browse list can disable the request
	 * button on coaches the client already has a row with.
	 */
	private async relationshipStatuses(clientId: string, tenantIds: string[]) {
		if (tenantIds.length === 0) {
			return new Map<string, MembershipStatus>();
		}

		const memberships = await this.membershipRepository.find({
			where: {
				client: { id: clientId },
				tenant: { id: In(tenantIds) },
			},
			relations: { tenant: true },
		});

		return new Map(
			memberships.map((membership) => [
				membership.tenant.id,
				membership.status,
			]),
		);
	}

	private toCard(tenant: Tenant, statuses: Map<string, MembershipStatus>) {
		const coach = tenant.ownerCoach;
		return {
			tenantId: tenant.id,
			tenantName: tenant.name,
			slug: tenant.slug,
			logoUrl: tenant.logoUrl,
			coach: {
				id: coach.id,
				firstName: coach.firstName,
				lastName: coach.lastName,
				avatarUrl: coach.avatarUrl,
				bio: coach.bio,
				specialties: coach.specialties,
				yearsExperience: coach.yearsExperience,
				certifications: coach.certifications,
				socialLinks: coach.socialLinks,
				location: coach.location,
				offlineAvailability: coach.offlineAvailability,
				priceFrom: coach.priceFrom,
				priceTo: coach.priceTo,
			},
			membershipStatus: statuses.get(tenant.id) ?? null,
		};
	}
}
