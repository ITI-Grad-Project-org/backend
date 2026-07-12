import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common';
import helmet from 'helmet';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { allowedOrigins } from './config/configuration';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	app.getHttpAdapter().getInstance().set('trust proxy', 1);

	const config = new DocumentBuilder()
		.setTitle('3Keys API')
		.setDescription('3Keys Backend API Documentation')
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
