import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter, RedisIoAdapter } from './common';

import { ConfigService } from './config';
import { allowedOrigins } from './config/configuration';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	app.getHttpAdapter().getInstance().set('trust proxy', 1);

	// A Socket.IO room lives in one process, so on more than one replica the
	// gateways need a shared adapter or half of every broadcast lands in an empty
	// room. Must happen before listen(), while the gateways are still being built.
	const socketAdapter = new RedisIoAdapter(app);
	await socketAdapter.connect(app.get(ConfigService).redisConfig.url);
	app.useWebSocketAdapter(socketAdapter);

	const config = new DocumentBuilder()
		.setTitle('UPLY')
		.setDescription('UPLY Backend API Documentation')
		.setVersion('1.0')
		.addBearerAuth()
		.build();
	const document = SwaggerModule.createDocument(app, config);
	SwaggerModule.setup('api/docs', app, document);

	app.use(helmet());

	app.enableCors({
		origin: allowedOrigins(),

		methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
		credentials: true,
	});

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
			forbidNonWhitelisted: true,
		}),
	);

	app.useGlobalFilters(new GlobalExceptionFilter());

	app.getHttpAdapter().getInstance().disable('x-powered-by');
	const port = process.env.PORT || 3000;

	await app.listen(port);
	Logger.log(`Server is running on port ${port}`, 'Bootstrap');
	Logger.log(
		`API documentation available at http://localhost:${port}/api/docs`,
		'Bootstrap',
	);
}

bootstrap();
