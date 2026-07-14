import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from 'src/config/config.service';
import { AuthPayload } from 'src/common/interfaces/authPayload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
	constructor(configService: ConfigService) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: configService.jwtConfig.accessToken.secret,
		});
	}

	validate(payload: AuthPayload): AuthPayload {
		if (payload.type !== 'tenant-user') {
			throw new UnauthorizedException('Invalid token type');
		}
		return {
			userId: payload.userId,
			email: payload.email,
			tenantId: payload.tenantId,
			type: 'tenant-user',
		};
	}
}
