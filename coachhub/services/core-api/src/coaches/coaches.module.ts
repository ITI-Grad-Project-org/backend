import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoachesService } from './coaches.service';
import { CoachesController } from './coaches.controller';
import { Coach } from './entities/coach.entity';
import { TenantModule } from '../tenant/tenant.module';
import { ExercisesModule } from '../exercises/exercises.module';

@Module({
	controllers: [CoachesController],
	providers: [CoachesService],
	imports: [TypeOrmModule.forFeature([Coach]), TenantModule, ExercisesModule],
	exports: [CoachesService],
})
export class CoachesModule {}
