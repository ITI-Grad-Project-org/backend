import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai/ai.module';
import { JwtAuthGuard } from './auth';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { ClientModule } from './clients/client.module';
import { CoachesModule } from './coaches/coaches.module';
import { ProxyThrottlerGuard } from './common/guards/proxy-throttler.guard';
import { ConfigModule } from './config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { InvitationModule } from './invitation/invitation.module';
import { JoinRequestModule } from './join-requests/join-request.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { MeasurementsModule } from './measurements/measurements.module';
import { MessagingModule } from './messaging/messaging.module';
import { PlansModule } from './plans/plans.module';
import { ReviewsModule } from './reviews/reviews.module';
import { TenantModule } from './tenant/tenant.module';
import { ExercisesModule } from './exercises/exercises.module';

@Module({
	imports: [
		ConfigModule,
		ThrottlerModule.forRoot([
			{
				ttl: 60_000,
				limit: 100,
			},
		]),
		DatabaseModule,
		AuthModule,
		ClientModule,
		PlansModule,
		MeasurementsModule,
		MessagingModule,
		AiModule,
		HealthModule,
		CoachesModule,
		TenantModule,
		InvitationModule,
		JoinRequestModule,
		OnboardingModule,
		ReviewsModule,
		ExercisesModule,
		ChatModule,
	],

	providers: [
		{ provide: APP_GUARD, useClass: ProxyThrottlerGuard },
		{ provide: APP_GUARD, useClass: JwtAuthGuard },
	],
})
export class AppModule {}
