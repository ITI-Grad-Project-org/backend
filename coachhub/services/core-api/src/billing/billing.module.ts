import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { CoachesModule } from '../coaches/coaches.module';
import { ConfigModule } from '../config';
import { Tenant } from '../tenant/entities/tenant.entity';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { EntitlementService } from './entitlement.service';
import { PaymobService } from './paymob.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([PaymentAttempt, Tenant, ClientMembership]),
		CoachesModule,
		ConfigModule,
	],
	controllers: [BillingController],
	providers: [BillingService, EntitlementService, PaymobService],
	exports: [EntitlementService],
})
export class BillingModule {}
