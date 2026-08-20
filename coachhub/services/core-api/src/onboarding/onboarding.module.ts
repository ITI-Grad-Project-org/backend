import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { Invitation } from '../invitation/entities/invitation.entity';
import { ClientModule } from '../clients/client.module';
import { AuthModule } from '../auth/auth.module';
import { OtpProvider } from '../common';
import { BillingModule } from '../billing/billing.module';

@Module({
	controllers: [OnboardingController],
	providers: [OnboardingService, OtpProvider],
	imports: [
		TypeOrmModule.forFeature([Invitation]),
		ClientModule,
		AuthModule,
		BillingModule,
	],
})
export class OnboardingModule {}
