import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy }                  from '@nestjs/passport';
import { ExtractJwt, Strategy }              from 'passport-jwt';
import { Request }                           from 'express';
import { ConfigService }                     from 'src/config/config.service';
import {
	ClientAuthPayload
}                                            from 'src/common/interfaces/client-auth-payload.interface';

@Injectable()
export class ClientJwtRefreshStrategy extends PassportStrategy(
	Strategy,
	'customer-jwt-refresh',
) {
	constructor ( configService: ConfigService ) {
		super( {
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: configService.jwtConfig.refreshToken.secret,
			passReqToCallback: true,
		} );
	}

	validate ( req: Request, payload: ClientAuthPayload ): ClientAuthPayload {
		if ( payload.type !== 'client' ) {
			throw new UnauthorizedException( 'Invalid token type' );
		}
		const refreshToken = req.get( 'Authorization' )?.replace( 'Bearer ', '' );
		return {
			clientId: payload.clientId,
			email: payload.email,
			tenantId: payload.tenantId,
			type: 'client',
			refreshToken,
		};
	}
}
