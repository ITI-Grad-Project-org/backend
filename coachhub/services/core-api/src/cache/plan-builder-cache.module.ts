import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { createKeyvNonBlocking } from '@keyv/redis';
import { ConfigModule, ConfigService } from '../config';
import { PlanBuilderCacheService } from './plan-builder-cache.service';

@Module({
	imports: [
		CacheModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				stores: [
					createKeyvNonBlocking(configService.redisConfig.url, {
						namespace: 'coachhub',
					}),
				],
			}),
		}),
	],
	providers: [PlanBuilderCacheService],
	exports: [PlanBuilderCacheService],
})
export class PlanBuilderCacheModule {}
