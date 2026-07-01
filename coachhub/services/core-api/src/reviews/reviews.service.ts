import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UserStatus } from '../auth';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { Review } from './entities/review.entity';
// import { ReviewContentFilterService } from './review-content-filter.service';

// TODO(reviews): add coach report endpoint so a coach can report a review or reviewer.
// Reported reviews may be unpublished automatically or sent to admin moderation.
// Endpoint idea:
// POST /reviews/:reviewId/report
// Coach-authenticated, tenant-scoped. The coach can only report reviews belonging to their own tenant.

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    @InjectRepository(ClientMembership)
    private readonly membershipRepository: Repository<ClientMembership>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    // private readonly contentFilter: ReviewContentFilterService,
  ) {}

  async createClientReview(
    clientId: number,
    tenantId: number | null,
    dto: CreateReviewDto,
  ) {
    const activeTenantId = this.assertActiveTenant(tenantId);
    await this.assertActiveMembership(clientId, activeTenantId);
    // this.contentFilter.assertAllowed(dto.comment);

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
    clientId: number,
    tenantId: number | null,
    dto: UpdateReviewDto,
  ) {
    const activeTenantId = this.assertActiveTenant(tenantId);
    await this.assertActiveMembership(clientId, activeTenantId);

    const review = await this.findClientReviewEntity(clientId, activeTenantId);
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // if (dto.comment) {
    //    this.contentFilter.assertAllowed(dto.comment);
    // }

    Object.assign(review, dto);
    return this.toReviewResponse(await this.reviewRepository.save(review));
  }

  //soft delet
  async deleteClientReview(clientId: number, tenantId: number | null) {
    const activeTenantId = this.assertActiveTenant(tenantId);
    await this.assertActiveMembership(clientId, activeTenantId);

    const review = await this.findClientReviewEntity(clientId, activeTenantId);
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    await this.reviewRepository.softDelete(review.id);
    return { message: 'Review deleted' };
  }

  async getCurrentClientReview(clientId: number, tenantId: number | null) {
    const activeTenantId = this.assertActiveTenant(tenantId);
    await this.assertActiveMembership(clientId, activeTenantId);

    const review = await this.findClientReviewEntity(clientId, activeTenantId);
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return this.toReviewResponse(review);
  }

  //**
  //

  //     >>>>>>>>>>>>>>> >        COACH ENDPOINTS      <<<<<<<<<<<<
  //
  //
  //  */

  async findTenantReviewsForCoach(tenantId: number) {
    const reviews = await this.findTenantReviews(tenantId);
    return reviews.map((review) => this.toReviewResponse(review));
  }

  async findPublicCoachReviews(tenantId: number) {
    const reviews = await this.findTenantReviews(tenantId);
    return reviews.map((review) => this.toReviewResponse(review));
  }

  async getPublicCoachReviewSummary(tenantId: number) {
    return this.getRatingSummary(tenantId);
  }

  async getPublicCoachProfile(tenantId: number) {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      relations: { user: true },
    });

    if (!tenant || !tenant.user) {
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

  //**
  //

  //     >>>>>>>>>>>>>>> >       HELPER FUNCTIONS       <<<<<<<<<<<<
  //
  //
  //  */

  private assertActiveTenant(tenantId: number | null) {
    if (!tenantId) {
      throw new BadRequestException('No active tenant selected');
    }
    return tenantId;
  }

  private async assertActiveMembership(clientId: number, tenantId: number) {
    const membership = await this.membershipRepository.findOne({
      where: { client: { id: clientId }, tenant: { id: tenantId } },
    });

    if (!membership) {
      throw new ForbiddenException('Client is not a member of this tenant');
    }

    if (membership.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Client membership is not active');
    }
  }

  private findClientReviewEntity(clientId: number, tenantId: number) {
    return this.reviewRepository.findOne({
      where: {
        client: { id: clientId },
        tenant: { id: tenantId },
      },
      relations: { client: true, tenant: true },
    });
  }

  private findTenantReviews(tenantId: number) {
    return this.reviewRepository.find({
      where: {
        tenant: { id: tenantId },
        deleted_at: IsNull(),
      },
      relations: { client: true },
      order: { created_at: 'DESC' },
    });
  }

  private async getRatingSummary(tenantId: number) {
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
            name: review.client.name,
            profilePicture: review.client.profilePicture,
          }
        : undefined,
    };
  }

  private toCoachProfileResponse(tenant: Tenant) {
    const coach = tenant.user;
    return {
      id: coach.id,
      name: coach.name,
      certifications: coach.certifications,
      specializations: coach.specializations,
      yearsOfExperience: coach.yearsOfExperience,
      professionalExperience: coach.professionalExperience,
      portfolio: coach.portfolio,
      clientTransformations: coach.clientTransformations,
      offlineCoachingAvailable: coach.offlineCoachingAvailable,
      location: coach.location,
      biography: coach.biography,
      availabilityHours: coach.availabilityHours,
      priceRange: coach.priceRange,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
    };
  }
}
