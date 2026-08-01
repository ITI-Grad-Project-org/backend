import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { Config } from './config.interface';

@Injectable()
export class ConfigService {
	constructor(private readonly configService: NestConfigService) {}

	get appConfig(): Config['app'] {
		return this.configService.getOrThrow<Config['app']>('app');
	}

	get databaseConfig(): Config['database'] {
		return this.configService.getOrThrow<Config['database']>('database');
	}

	get rabbitmqConfig(): Config['rabbitmq'] {
		return this.configService.getOrThrow<Config['rabbitmq']>('rabbitmq');
	}

	get jwtConfig(): Config['jwt'] {
		return this.configService.getOrThrow<Config['jwt']>('jwt');
	}

	get awsConfig(): Config['aws'] {
		return this.configService.getOrThrow<Config['aws']>('aws');
	}

	get imageTypes(): Config['imageTypes'] {
		return this.configService.getOrThrow<Config['imageTypes']>('imageTypes');
	}

	get documentTypes(): Config['documentTypes'] {
		return this.configService.getOrThrow<Config['documentTypes']>(
			'documentTypes',
		);
	}

	get googleOauthConfig(): Config['googleOauth'] {
		return this.configService.getOrThrow<Config['googleOauth']>('googleOauth');
	}

	get aiConfig(): Config['ai'] {
		return this.configService.getOrThrow<Config['ai']>('ai');
	}
}
