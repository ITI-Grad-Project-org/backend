import { Module }        from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

@Module( {
	imports: [
		TypeOrmModule.forRootAsync( {
			inject: [ ConfigService ],
			useFactory: ( config: ConfigService ) => ( {
				type: 'postgres',
				url: config.getOrThrow<string>( 'database.uri' ),
				entities: [ __dirname + '/../**/*.entity{.ts,.js}' ],
				synchronize: true,
				logging: config.get<string>( 'app.nodeEnv' ) === 'development',
			} ),
		} ),
	],
} )
export class DatabaseModule {}
