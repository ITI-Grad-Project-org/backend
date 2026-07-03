import { Module }            from '@nestjs/common';
import { TypeOrmModule }     from '@nestjs/typeorm';
import { CoachesService }    from './coaches.service';
import { CoachesController } from './coaches.controller';
import { Coach }             from './entities/coach.entity';
import { TenantModule }      from '../tenant/tenant.module';

@Module( {
	controllers: [ CoachesController ],
	providers: [ CoachesService ],
	imports: [ TypeOrmModule.forFeature( [ Coach ] ), TenantModule ],
	exports: [ CoachesService ],
} )
export class CoachesModule {}
