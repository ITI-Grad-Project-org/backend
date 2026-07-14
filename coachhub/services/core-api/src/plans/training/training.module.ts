import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientMembership } from '../../clients/entities/client-membership.entity';
import { Exercise } from '../../exercises/entities/exercise.entity';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { PlannedExercise } from './entities/planned-exercise.entity';
import { PlannedSet } from './entities/planned-set.entity';
import { ProgramDay } from './entities/program-day.entity';
import { ProgramWeek } from './entities/program-week.entity';
import { Program } from './entities/program.entity';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			Program,
			ProgramWeek,
			ProgramDay,
			PlannedExercise,
			PlannedSet,
			Exercise,
			ClientMembership,
		]),
	],
	controllers: [TrainingController],
	providers: [TrainingService],
})
export class TrainingModule {}
