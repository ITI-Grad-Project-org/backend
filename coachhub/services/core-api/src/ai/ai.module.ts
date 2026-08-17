import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MessagingModule } from '../messaging/messaging.module';
import { AiService } from './ai.service';
import { AiCompletedConsumer } from './ai-completed.consumer';
import { AiPlanCompletedConsumer } from './ai-plan-completed.consumer';
import { AiGateway } from './ai.gateway';
import { AiPlanSuggestion } from './entities/ai-plan-suggestion.entity';
import { PlanAcceptanceService } from './plan-acceptance.service';
import { PlanContextService } from './plan-context.service';
import { PlanSuggestionsController } from './plan-suggestions.controller';
import { PlanSuggestionsService } from './plan-suggestions.service';
import { ClientIntake } from '../clients/entities/client-intake.entity';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { Exercise } from '../exercises/entities/exercise.entity';
import { Measurement } from '../measurements/entities/measurement.entity';
import { Food } from '../plans/nutrition/entities/food.entity';
import { Meal } from '../plans/nutrition/entities/meal.entity';
import { ConfigService } from '../config';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [
		ConfigModule,
		MessagingModule,
		AuthModule,
		TypeOrmModule.forFeature([
			AiPlanSuggestion,
			ClientIntake,
			ClientMembership,
			Exercise,
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
		ConfigService,
		PlanAcceptanceService,
		PlanContextService,
		PlanSuggestionsService,
	],
})
export class AiModule {}
