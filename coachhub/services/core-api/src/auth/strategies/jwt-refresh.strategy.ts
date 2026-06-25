import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from 'src/config/config.service';
import { AuthPayload } from 'src/common/interfaces/authPayload.interface';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.jwtConfig.refreshToken.secret,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: AuthPayload) {
    if (payload.type !== 'tenant-user') {
      throw new UnauthorizedException('Invalid token type');
    }
    const refreshToken = req.get('Authorization')?.replace('Bearer ', '');
    return {
      userId: payload.userId,
      email: payload.email,
      tenantId: payload.tenantId,
      type: 'tenant-user' as const,
      refreshToken,
    };
  }
}
