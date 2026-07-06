import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ClientAuthPayload } from 'src/common/interfaces/client-auth-payload.interface';
import { ConfigService } from 'src/config/config.service';

@Injectable()
export class ClientJwtRefreshStrategy extends PassportStrategy(
	Strategy,
	'client-jwt-refresh',
) {
	constructor(configService: ConfigService) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: configService.jwtConfig.refreshToken.secret,
			passReqToCallback: true,
		});
	}

	validate(req: Request, payload: ClientAuthPayload): ClientAuthPayload {
		if (payload.type !== 'client') {
			throw new UnauthorizedException('Invalid token type');
		}
		const refreshToken = req.get('Authorization')?.replace('Bearer ', '');
		return {
			clientId: payload.clientId,
			email: payload.email,
			tenantId: payload.tenantId,
			type: 'client',
			refreshToken,
		};
	}
}
