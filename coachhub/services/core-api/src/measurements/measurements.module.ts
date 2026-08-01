import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { Measurement } from './entities/measurement.entity';
import { MeasurementsController } from './measurements.controller';
import { MeasurementsService } from './measurements.service';
import { S3UploadModule } from '../s3-upload/s3-upload.module';

@Module({
	imports: [
		TypeOrmModule.forFeature([Measurement, ClientMembership]),
		S3UploadModule,
	],
	controllers: [MeasurementsController],
	providers: [MeasurementsService],
	exports: [MeasurementsService],
})
export class MeasurementsModule {}
