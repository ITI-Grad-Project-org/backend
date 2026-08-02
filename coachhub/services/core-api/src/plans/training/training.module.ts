import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityModule } from '../../activity/activity.module';
import { ClientMembership } from '../../clients/entities/client-membership.entity';
import { Exercise } from '../../exercises/entities/exercise.entity';
import { ClientTrainingController } from './client-training.controller';
import { TrainingController } from './training.controller';
import { PlannedExercise } from './entities/planned-exercise.entity';
import { PlannedSet } from './entities/planned-set.entity';
import { LoggedExercise } from './entities/logged-exercise.entity';
import { LoggedSet } from './entities/logged-set.entity';
import { LoggedWorkout } from './entities/logged-workout.entity';
import { ProgramDay } from './entities/program-day.entity';
import { ProgramWeek } from './entities/program-week.entity';
import { Program } from './entities/program.entity';
import { ClientProgramsService } from './services/client-programs.service';
import { ClientTrainingProgramsService } from './services/client-training-programs.service';
import { ClientWorkoutFinalizationService } from './services/client-workout-finalization.service';
import { ClientWorkoutLogsService } from './services/client-workout-logs.service';
import { ClientWorkoutSessionService } from './services/client-workout-session.service';
import { ClientWorkoutSetLoggingService } from './services/client-workout-set-logging.service';
import { PlannedExercisesService } from './services/planned-exercises.service';
import { ProgramDaysService } from './services/program-days.service';
import { ProgramLifecycleService } from './services/program-lifecycle.service';
import { WorkoutLogReviewService } from './services/workout-log-review.service';

@Module({
	imports: [
		ActivityModule,
		TypeOrmModule.forFeature([
			Program,
			ProgramWeek,
			ProgramDay,
			PlannedExercise,
			PlannedSet,
			LoggedWorkout,
			LoggedExercise,
			LoggedSet,
			Exercise,
			ClientMembership,
		]),
	],
	controllers: [TrainingController, ClientTrainingController],
	providers: [
		ClientProgramsService,
		ClientTrainingProgramsService,
		ClientWorkoutFinalizationService,
		ClientWorkoutLogsService,
		ClientWorkoutSessionService,
		ClientWorkoutSetLoggingService,
		ProgramDaysService,
		PlannedExercisesService,
		ProgramLifecycleService,
		WorkoutLogReviewService,
	],
})
export class TrainingModule {}
