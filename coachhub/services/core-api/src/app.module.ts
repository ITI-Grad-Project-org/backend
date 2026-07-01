import { Module }              from '@nestjs/common';
import { ConfigModule }        from './config';
import { DatabaseModule }      from './database/database.module';
import { AuthModule }          from './auth/auth.module';
import { ClientModule }        from './clients/client.module';
import { PlansModule }         from './plans/plans.module';
import { CheckinsModule }      from './checkins/checkins.module';
import { MessagingModule }     from './messaging/messaging.module';
import { AiModule }            from './ai/ai.module';
import { EventsModule }        from './events/events.module';
import { HealthModule }        from './health/health.module';
import { UsersModule }         from './users/users.module';
import { ThrottlerModule }     from '@nestjs/throttler';
import { TenantModule }        from './tenant/tenant.module';
import { APP_GUARD }           from '@nestjs/core';
import { ProxyThrottlerGuard } from './common/guards/proxy-throttler.guard';
import { InvitationModule }    from './invitation/invitation.module';
import { JwtAuthGuard }        from './auth';
import { ReviewsModule }       from './reviews/reviews.module';

@Module( {
	imports: [
		ConfigModule,
		ThrottlerModule.forRoot( [
			{
				ttl: 60_000,
				limit: 100,
			},
		] ),
		DatabaseModule,
		AuthModule,
		ClientModule,
		PlansModule,
		CheckinsModule,
		MessagingModule,
		AiModule,
		EventsModule,
		HealthModule,
		UsersModule,
		TenantModule,
		InvitationModule,
		ReviewsModule
	],

	providers: [
		{ provide: APP_GUARD, useClass: ProxyThrottlerGuard },
		{ provide: APP_GUARD, useClass: JwtAuthGuard },
	],
} )
export class AppModule {}
