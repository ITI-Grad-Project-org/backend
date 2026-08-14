import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsProxyService } from './analytics-proxy.service';

@Module({
	controllers: [AnalyticsController],
	providers: [AnalyticsProxyService],
	exports: [AnalyticsProxyService],
})
export class AnalyticsModule {}
