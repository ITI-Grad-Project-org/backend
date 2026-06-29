import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy }                  from '@nestjs/passport';
import { ExtractJwt, Strategy }              from 'passport-jwt';
import { ConfigService }                     from 'src/config/config.service';
import { ClientAuthPayload }                 from '../../common';

@Injectable()
export class ClientJwtStrategy extends PassportStrategy(
	Strategy,
	'client-jwt',
) {
	constructor ( configService: ConfigService ) {
		super( {
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: configService.jwtConfig.accessToken.secret,
		} );
	}

	validate ( payload: ClientAuthPayload ): ClientAuthPayload {
		if ( payload.type !== 'client' ) {
			throw new UnauthorizedException( 'Invalid token type' );
		}
		return {
			clientId: payload.clientId,
			email: payload.email,
			tenantId: payload.tenantId,
			type: 'client',
		};
	}
}
