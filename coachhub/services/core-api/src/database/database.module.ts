import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				type: 'postgres',
				url: config.getOrThrow<string>('database.uri'),
				entities: [__dirname + '/../**/*.entity{.ts,.js}'],
				synchronize: config.getOrThrow<boolean>('database.synchronize'),
				logging: config.get<string>('app.nodeEnv') === 'development',
				// K8s has no depends_on: survive Postgres arriving after the pod.
				retryAttempts: 10,
				retryDelay: 3000,
			}),
		}),
	],
})
export class DatabaseModule {}
