import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientMembership } from '../../clients/entities/client-membership.entity';
import { Exercise } from '../../exercises/entities/exercise.entity';
import { ClientTrainingController } from './client-training.controller';
import { TrainingController } from './training.controller';
import { PlannedExercise } from './entities/planned-exercise.entity';
import { PlannedSet } from './entities/planned-set.entity';
import { LoggedWorkout } from './entities/logged-workout.entity';
import { ProgramDay } from './entities/program-day.entity';
import { ProgramWeek } from './entities/program-week.entity';
import { Program } from './entities/program.entity';
import { ClientProgramsService } from './services/client-programs.service';
import { ClientTrainingProgramsService } from './services/client-training-programs.service';
import { PlannedExercisesService } from './services/planned-exercises.service';
import { ProgramDaysService } from './services/program-days.service';
import { ProgramLifecycleService } from './services/program-lifecycle.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			Program,
			ProgramWeek,
			ProgramDay,
			PlannedExercise,
			PlannedSet,
			LoggedWorkout,
			Exercise,
			ClientMembership,
		]),
	],
	controllers: [TrainingController, ClientTrainingController],
	providers: [
		ClientProgramsService,
		ClientTrainingProgramsService,
		ProgramDaysService,
		PlannedExercisesService,
		ProgramLifecycleService,
	],
})
export class TrainingModule {}
