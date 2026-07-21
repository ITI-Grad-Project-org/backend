import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvitationService } from './invitation.service';
import { InvitationController } from './invitation.controller';
import { Invitation } from './entities/invitation.entity';
import { MessagingModule } from '../messaging/messaging.module';
import { CoachesModule } from '../coaches/coaches.module';
import { OtpProvider } from '../common';

@Module({
	controllers: [InvitationController],
	providers: [InvitationService, OtpProvider],
	imports: [
		TypeOrmModule.forFeature([Invitation]),
		MessagingModule,
		CoachesModule,
	],
	exports: [InvitationService],
})
export class InvitationModule {}
