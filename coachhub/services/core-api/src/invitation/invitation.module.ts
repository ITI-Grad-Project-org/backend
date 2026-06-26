import { Module }               from '@nestjs/common';
import { TypeOrmModule }         from '@nestjs/typeorm';
import { InvitationService }     from './invitation.service';
import { InvitationController }  from './invitation.controller';
import { Invitation }           from './entities/invitation.entity';
import { MessagingModule }       from '../messaging/messaging.module';
import { ConfigModule }          from '../config';
import { UsersModule }           from '../users/users.module';
import { ClientModule }          from '../clients/client.module';

@Module( {
	controllers: [ InvitationController ],
	providers: [ InvitationService ],
	imports: [
		TypeOrmModule.forFeature( [ Invitation ] ),
		MessagingModule,
		ConfigModule,
		UsersModule,
		ClientModule,
	],
	exports: [ InvitationService ],
} )
export class InvitationModule {}
