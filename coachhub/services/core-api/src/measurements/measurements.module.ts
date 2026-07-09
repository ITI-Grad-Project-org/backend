import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { Measurement } from './entities/measurement.entity';
import { MeasurementsController } from './measurements.controller';
import { MeasurementsService } from './measurements.service';

@Module({
	imports: [TypeOrmModule.forFeature([Measurement, ClientMembership])],
	controllers: [MeasurementsController],
	providers: [MeasurementsService],
	exports: [MeasurementsService],
})
export class MeasurementsModule {}
