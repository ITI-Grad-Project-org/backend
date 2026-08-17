import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { ConfigService } from 'src/config';

/** Shared Google ID token verification, used by both the coach and customer auth flows. */
@Injectable()
export class GoogleTokenProvider {
	private readonly logger = new Logger(GoogleTokenProvider.name);
	private readonly client: OAuth2Client;

	constructor(private readonly configService: ConfigService) {
		this.client = new OAuth2Client(
			this.configService.googleOauthConfig.clientId,
		);
	}

	async verifyIdToken(idToken: string): Promise<TokenPayload> {
		let ticket;
		try {
			ticket = await this.client.verifyIdToken({
				idToken,
				audience: this.configService.googleOauthConfig.clientId,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.warn(`Google ID token verification failed: ${message}`);
			throw new UnauthorizedException('Invalid Google ID token');
		}

		const payload = ticket.getPayload();
		if (!payload || !payload.sub || !payload.email) {
			throw new UnauthorizedException('Invalid Google ID token payload');
		}
		if (!payload.email_verified) {
			throw new UnauthorizedException('Google email is not verified');
		}
		return payload;
	}
}
