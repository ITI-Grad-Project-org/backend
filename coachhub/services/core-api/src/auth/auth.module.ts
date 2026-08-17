import { BadRequestException, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthService } from './services/auth.service';
import { AuthController } from './auth.controller';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './services/client-auth.service';
import { TokenProvider } from './providers/token.provider';
import { PasswordResetOtpProvider } from './providers/password-reset-otp.provider';
import { GoogleTokenProvider } from './providers/google-token.provider';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { ClientJwtStrategy } from './strategies/client-jwt.strategy';
import { ClientJwtRefreshStrategy } from './strategies/client-jwt-refresh.strategy';
import { WsAuthService } from './services/ws-auth.service';
import { TenantModule } from '../tenant/tenant.module';

import { ConfigModule } from 'src/config/config.module';
import { S3UploadModule } from '../s3-upload/s3-upload.module';

import { CoachesModule } from '../coaches/coaches.module';
import { ClientModule } from '../clients/client.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
	imports: [
		CoachesModule,
		ClientModule,
		TenantModule,
		ConfigModule,
		MessagingModule,
		PassportModule,
		JwtModule.register({}),
		S3UploadModule,

		MulterModule.register({
			storage: memoryStorage(),
			fileFilter: (_req, file, cb) => {
				if (!/\.(jpg|jpeg|png|webp|pdf)$/i.test(file.originalname)) {
					return cb(
						new BadRequestException(
							`Unsupported file "${file.originalname}" on field "${file.fieldname}". Only JPG, PNG, WEBP, or PDF files are allowed.`,
						),
						false,
					);
				}
				cb(null, true);
			},
			limits: { fileSize: 5 * 1024 * 1024 },
		}),
	],
	controllers: [AuthController, ClientAuthController],
	providers: [
		AuthService,
		ClientAuthService,
		TokenProvider,
		PasswordResetOtpProvider,
		GoogleTokenProvider,
		JwtStrategy,
		JwtRefreshStrategy,
		ClientJwtStrategy,
		ClientJwtRefreshStrategy,
		WsAuthService,
	],
	exports: [AuthService, ClientAuthService, TokenProvider, WsAuthService],
})
export class AuthModule {}
