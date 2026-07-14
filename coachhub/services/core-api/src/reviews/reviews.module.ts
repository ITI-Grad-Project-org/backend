import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { ClientReviewsController } from './client-reviews.controller';
import { Review } from './entities/review.entity';
import { ReviewsController } from './reviews.controller';
// import { ReviewContentFilterService } from './review-content-filter.service';
import { ReviewsService } from './reviews.service';

@Module({
	imports: [TypeOrmModule.forFeature([Review, ClientMembership, Tenant])],
	controllers: [ReviewsController, ClientReviewsController],
	providers: [ReviewsService],
})
export class ReviewsModule {}
