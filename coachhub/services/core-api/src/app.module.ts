import { Module }          from '@nestjs/common';
import { ConfigModule }    from './config';
import { DatabaseModule }  from './database/database.module';
import { RabbitmqModule }  from './rabbitmq/rabbitmq.module';
import { AuthModule }      from './auth/auth.module';
import { ClientModule }    from './clients/client.module';
import { PlansModule }     from './plans/plans.module';
import { CheckinsModule }  from './checkins/checkins.module';
import { MessagingModule } from './messaging/messaging.module';
import { AiModule }        from './ai/ai.module';
import { EventsModule }    from './events/events.module';
import { HealthModule }    from './health/health.module';
import { UsersModule }     from './users/users.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { TenantModule }    from './tenant/tenant.module';

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
		RabbitmqModule,
		AuthModule,
		ClientModule,
		PlansModule,
		CheckinsModule,
		MessagingModule,
		AiModule,
		EventsModule,
		HealthModule,
		ClientModule,
		UsersModule,
		TenantModule
	],
} )
export class AppModule {}
