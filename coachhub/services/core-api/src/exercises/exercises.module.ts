import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DefaultExercise } from './entities/default-exercise.entity';
import { Exercise } from './entities/exercise.entity';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';

@Module({
	providers: [ExercisesService],
	imports: [TypeOrmModule.forFeature([Exercise, DefaultExercise])],
	controllers: [ExercisesController],
	exports: [ExercisesService],
})
export class ExercisesModule {}
