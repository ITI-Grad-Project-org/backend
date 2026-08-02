import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/entities/client.entity';
import { ActivityController } from './activity.controller';
import { ActivityLog } from './entities/activity-log.entity';
import { ActivityGraphService } from './services/activity-graph.service';
import { ActivityRecorderService } from './services/activity-recorder.service';

@Module({
	imports: [TypeOrmModule.forFeature([ActivityLog, Client])],
	controllers: [ActivityController],
	providers: [ActivityGraphService, ActivityRecorderService],
	exports: [ActivityRecorderService],
})
export class ActivityModule {}
