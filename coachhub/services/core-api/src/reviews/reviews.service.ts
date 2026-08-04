import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { MembershipStatus } from '../common';
import { Tenant } from '../tenant/entities/tenant.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { Review } from './entities/review.entity';

@Injectable()
export class ReviewsService {
	constructor(
		@InjectRepository(Review)
		private readonly reviewRepository: Repository<Review>,
		@InjectRepository(ClientMembership)
		private readonly membershipRepository: Repository<ClientMembership>,
		@InjectRepository(Tenant)
		private readonly tenantRepository: Repository<Tenant>,
	) {}

	async createClientReview(
		clientId: string,
		tenantId: string | null,
		dto: CreateReviewDto,
	) {
		const activeTenantId = this.assertActiveTenant(tenantId);
		await this.assertActiveMembership(clientId, activeTenantId);

		const existingReview = await this.reviewRepository.findOne({
			where: {
				client: { id: clientId },
				tenant: { id: activeTenantId },
			},
			relations: { client: true, tenant: true },
			withDeleted: true,
		});

		if (existingReview && !existingReview.deleted_at) {
			throw new ConflictException('Client has already reviewed this coach');
		}

		if (existingReview) {
			Object.assign(existingReview, {
				rating: dto.rating,
				comment: dto.comment,
				deleted_at: null,
			});
			return this.toReviewResponse(
				await this.reviewRepository.save(existingReview),
			);
		}

		const review = this.reviewRepository.create({
			rating: dto.rating,
			comment: dto.comment,
			client: { id: clientId },
			tenant: { id: activeTenantId },
		});

		return this.toReviewResponse(await this.reviewRepository.save(review));
	}

	async updateClientReview(
		clientId: string,
		tenantId: string | null,
		dto: UpdateReviewDto,
	) {
		const activeTenantId = this.assertActiveTenant(tenantId);
		await this.assertActiveMembership(clientId, activeTenantId);

		const review = await this.findClientReviewEntity(clientId, activeTenantId);
		if (!review) {
			throw new NotFoundException('Review not found');
		}

		Object.assign(review, dto);
		return this.toReviewResponse(await this.reviewRepository.save(review));
	}

	async deleteClientReview(clientId: string, tenantId: string | null) {
		const activeTenantId = this.assertActiveTenant(tenantId);
		await this.assertActiveMembership(clientId, activeTenantId);

		const review = await this.findClientReviewEntity(clientId, activeTenantId);
		if (!review) {
			throw new NotFoundException('Review not found');
		}

		await this.reviewRepository.softDelete(review.id);
		return { message: 'Review deleted' };
	}

	async getCurrentClientReview(clientId: string, tenantId: string | null) {
		const activeTenantId = this.assertActiveTenant(tenantId);
		await this.assertActiveMembership(clientId, activeTenantId);

		const review = await this.findClientReviewEntity(clientId, activeTenantId);
		if (!review) {
			throw new NotFoundException('Review not found');
		}

		return this.toReviewResponse(review);
	}

	async findTenantReviewsForCoach(tenantId: string) {
		const reviews = await this.findTenantReviews(tenantId);
		return reviews.map((review) => this.toReviewResponse(review));
	}

	async findPublicCoachReviews(tenantId: string) {
		const reviews = await this.findTenantReviews(tenantId);
		return reviews.map((review) => this.toReviewResponse(review));
	}

	async getPublicCoachReviewSummary(tenantId: string) {
		return this.getRatingSummary(tenantId);
	}

	async getPublicCoachProfile(tenantId: string) {
		const tenant = await this.tenantRepository.findOne({
			where: { id: tenantId },
			relations: { ownerCoach: true },
		});

		if (!tenant || !tenant.ownerCoach) {
			throw new NotFoundException('Coach profile not found');
		}

		const [summary, reviews] = await Promise.all([
			this.getRatingSummary(tenantId),
			this.findPublicCoachReviews(tenantId),
		]);

		return {
			coach: this.toCoachProfileResponse(tenant),
			rating: summary,
			reviews,
		};
	}

	private assertActiveTenant(tenantId: string | null) {
		if (!tenantId) {
			throw new BadRequestException('No active tenant selected');
		}
		return tenantId;
	}

	private async assertActiveMembership(clientId: string, tenantId: string) {
		const membership = await this.membershipRepository.findOne({
			where: { client: { id: clientId }, tenant: { id: tenantId } },
		});

		if (!membership) {
			throw new ForbiddenException('Client is not a member of this tenant');
		}

		if (membership.status !== MembershipStatus.ACTIVE) {
			throw new ForbiddenException('Client membership is not active');
		}
	}

	private findClientReviewEntity(clientId: string, tenantId: string) {
		return this.reviewRepository.findOne({
			where: {
				client: { id: clientId },
				tenant: { id: tenantId },
			},
			relations: { client: true, tenant: true },
		});
	}

	private findTenantReviews(tenantId: string) {
		return this.reviewRepository.find({
			where: {
				tenant: { id: tenantId },
				deleted_at: IsNull(),
			},
			relations: { client: true },
			order: { created_at: 'DESC' },
		});
	}

	private async getRatingSummary(tenantId: string) {
		const result = await this.reviewRepository
			.createQueryBuilder('review')
			.select('AVG(review.rating)', 'average')
			.addSelect('COUNT(review.id)', 'count')
			.where('review.tenant_id = :tenantId', { tenantId })
			.andWhere('review.deleted_at IS NULL')
			.getRawOne<{ average: string | null; count: string }>();
		const count = Number(result?.count ?? 0);
		const average = result?.average
			? Number(Number(result.average).toFixed(1))
			: 0;

		return { average, count };
	}

	private toReviewResponse(review: Review) {
		return {
			id: review.id,
			rating: review.rating,
			comment: review.comment,
			created_at: review.created_at,
			updated_at: review.updated_at,
			client: review.client
				? {
						id: review.client.id,
						firstName: review.client.firstName,
						lastName: review.client.lastName,
						avatarUrl: review.client.avatarUrl,
					}
				: undefined,
		};
	}

	// Public projection: the coach's full profile and media, minus contact
	// details (email/phone) and internal flags — this is served to anyone.
	private toCoachProfileResponse(tenant: Tenant) {
		const coach = tenant.ownerCoach;
		return {
			id: coach.id,
			firstName: coach.firstName,
			lastName: coach.lastName,
			avatarUrl: coach.avatarUrl,
			bio: coach.bio,
			age: coach.age,
			gender: coach.gender,
			location: coach.location,
			specialties: coach.specialties,
			yearsExperience: coach.yearsExperience,
			careerExperience: coach.careerExperience,
			certifications: coach.certifications,
			portfolioUrl: coach.portfolioUrl,
			transformationPhotos: coach.transformationPhotos,
			featuredReviews: coach.featuredReviews,
			offlineAvailability: coach.offlineAvailability,
			availabilityHours: coach.availabilityHours,
			priceFrom: coach.priceFrom,
			priceTo: coach.priceTo,
			socialLinks: coach.socialLinks,
			tenant: {
				id: tenant.id,
				name: tenant.name,
				slug: tenant.slug,
				logoUrl: tenant.logoUrl,
			},
		};
	}
}
