import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoachesService } from './coaches.service';
import { CoachesController } from './coaches.controller';
import { CoachMediaController } from './coach-media.controller';
import { CoachDirectoryController } from './coach-directory.controller';
import { CoachDirectoryService } from './coach-directory.service';
import { Coach } from './entities/coach.entity';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { ExercisesModule } from '../exercises/exercises.module';
import { TenantModule } from '../tenant/tenant.module';
import { S3UploadModule } from '../s3-upload/s3-upload.module';

@Module({
	// Directory first: CoachesController owns `@Get(':id')` on the same `coaches`
	// prefix, and Nest matches in registration order — registered after, the
	// literal `/coaches/directory` gets swallowed by `:id` and hits the coach
	// guard, so client tokens are rejected with "Invalid token type".
	controllers: [
		CoachDirectoryController,
		CoachMediaController,
		CoachesController,
	],
	providers: [CoachesService, CoachDirectoryService],
	imports: [
		TypeOrmModule.forFeature([Coach, ClientMembership]),
		TenantModule,
		ExercisesModule,
		S3UploadModule,
	],
	exports: [CoachesService],
})
export class CoachesModule {}
