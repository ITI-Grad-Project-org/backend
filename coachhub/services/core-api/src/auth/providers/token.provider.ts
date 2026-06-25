import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from 'src/config/config.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class TokenProvider {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async generateAccessToken<T extends object>(payload: T): Promise<string> {
    const { accessToken } = this.configService.jwtConfig;
    return this.jwtService.signAsync(payload, {
      secret: accessToken.secret,
      expiresIn: accessToken.expiresIn as any,
    });
  }

  async generateRefreshToken<T extends object>(payload: T): Promise<string> {
    const { refreshToken } = this.configService.jwtConfig;
    return this.jwtService.signAsync(payload, {
      secret: refreshToken.secret,
      expiresIn: refreshToken.expiresIn as any,
    });
  }

  async generateTokens<T extends object>(
    payload: T,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(payload),
      this.generateRefreshToken(payload),
    ]);
    return { accessToken, refreshToken };
  }

  async verifyAccessToken<T extends object>(token: string): Promise<T> {
    const { accessToken } = this.configService.jwtConfig;
    return this.jwtService.verifyAsync<T>(token, {
      secret: accessToken.secret,
    });
  }

  async verifyRefreshToken<T extends object>(token: string): Promise<T> {
    const { refreshToken } = this.configService.jwtConfig;
    return this.jwtService.verifyAsync<T>(token, {
      secret: refreshToken.secret,
    });
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  compareToken(token: string, hashedToken: string): boolean {
    const tokenHash = Buffer.from(this.hashToken(token), 'hex');
    const storedHash = Buffer.from(hashedToken, 'hex');
    if (tokenHash.length !== storedHash.length) {
      return false;
    }
    return crypto.timingSafeEqual(tokenHash, storedHash);
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async comparePassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }
}
