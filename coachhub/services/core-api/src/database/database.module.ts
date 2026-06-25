import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'coachhub'),
        password: config.get<string>('DB_PASSWORD', 'secret'),
        database: config.get<string>('DB_NAME', 'coachhub'),
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        synchronize: config.get<boolean>('DB_SYNCHRONIZE', false),
        logging: config.get<boolean>('DB_LOGGING', false),
        // TODO: add migrations path when entities are defined
      }),
    }),
  ],
})
export class DatabaseModule {}
