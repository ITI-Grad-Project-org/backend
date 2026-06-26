import { Module }                from '@nestjs/common';
import { TypeOrmModule }         from '@nestjs/typeorm';
import { ClientService }         from './client.service';
import { ClientMembershipService } from './client-membership.service';
import { ClientController }      from './client.controller';
import { Client }                from './entities/client.entity';
import { ClientMembership }      from './entities/client-membership.entity';

@Module( {
	imports: [ TypeOrmModule.forFeature( [ Client, ClientMembership ] ) ],
	controllers: [ ClientController ],
	providers: [ ClientService, ClientMembershipService ],
	exports: [ ClientService, ClientMembershipService ],
} )
export class ClientModule {}
