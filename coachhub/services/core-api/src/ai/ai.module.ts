import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MessagingModule } from '../messaging/messaging.module';
import { AiService } from './ai.service';
import { AiCompletedConsumer } from './ai-completed.consumer';
import { AiPlanCompletedConsumer } from './ai-plan-completed.consumer';
import { AiGateway } from './ai.gateway';
import { AiSubjectService } from './ai-subject.service';
import { AiPlanSuggestion } from './entities/ai-plan-suggestion.entity';
import { PlanAcceptanceService } from './plan-acceptance.service';
import { PlanContextService } from './plan-context.service';
import { PlanSuggestionsController } from './plan-suggestions.controller';
import { PlanSuggestionsService } from './plan-suggestions.service';
import { ClientIntake } from '../clients/entities/client-intake.entity';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { Checkin } from '../checkins/entities/checkin.entity';
import { Exercise } from '../exercises/entities/exercise.entity';
import { LoggedWorkout } from '../plans/training/entities/logged-workout.entity';
import { Measurement } from '../measurements/entities/measurement.entity';
import { Food } from '../plans/nutrition/entities/food.entity';
import { Meal } from '../plans/nutrition/entities/meal.entity';
import { ConfigService } from '../config';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';

@Module({
	imports: [
		ConfigModule,
		MessagingModule,
		AuthModule,
		BillingModule,
		TypeOrmModule.forFeature([
			AiPlanSuggestion,
			ClientIntake,
			ClientMembership,
			Checkin,
			Exercise,
			LoggedWorkout,
			Food,
			Meal,
			Measurement,
		]),
	],
	controllers: [PlanSuggestionsController],
	providers: [
		AiService,
		AiCompletedConsumer,
		AiPlanCompletedConsumer,
		AiGateway,
		AiSubjectService,
		ConfigService,
		PlanAcceptanceService,
		PlanContextService,
		PlanSuggestionsService,
	],
})
export class AiModule {}
