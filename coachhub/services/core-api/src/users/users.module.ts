import { Module }          from '@nestjs/common';
import { UsersService }    from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule }   from '@nestjs/typeorm';
import { User }            from './entities/user.entity';
import { TenantModule }    from '../tenant/tenant.module';

@Module( {
	controllers: [ UsersController ],
	providers: [ UsersService ],
	imports: [ TypeOrmModule.forFeature( [ User ] ), TenantModule ],
	exports: [ UsersService ],
} )
export class UsersModule {}
