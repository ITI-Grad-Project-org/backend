import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				type: 'postgres',
				url: config.getOrThrow<string>('database.uri'),
				entities: [__dirname + '/../**/*.entity{.ts,.js}'],
				synchronize: true,
				logging: config.get<string>('app.nodeEnv') === 'development',
			}),
		}),
	],
})
export class DatabaseModule {}
