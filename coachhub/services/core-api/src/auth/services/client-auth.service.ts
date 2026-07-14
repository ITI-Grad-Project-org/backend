import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { LoginTicket, OAuth2Client, TokenPayload } from 'google-auth-library';
import { ConfigService } from 'src/config';
import { ClientMembershipService } from '../../clients/client-membership.service';
import { ClientService } from '../../clients/client.service';
import { CreateClientDto } from '../../clients/dto/create-client.dto';
import { Client } from '../../clients/entities/client.entity';
import { ClientAuthPayload, MembershipStatus } from '../../common';
import { TokenProvider } from '../providers/token.provider';

@Injectable()
export class ClientAuthService {
	private readonly logger = new Logger(ClientAuthService.name);
	private readonly googleClient: OAuth2Client;

	constructor(
		private readonly clientService: ClientService,
		private readonly membershipService: ClientMembershipService,
		private readonly tokenProvider: TokenProvider,
		private readonly configService: ConfigService,
	) {
		this.googleClient = new OAuth2Client(
			this.configService.googleOauthConfig.clientId,
		);
	}

	async register(createClientDto: CreateClientDto) {
		const existing = await this.clientService.findOneByEmail(
			createClientDto.email,
		);
		if (existing) {
			throw new ConflictException('Email already in use');
		}

		if (createClientDto.phone) {
			const existingPhone = await this.clientService.findOneByPhone(
				createClientDto.phone,
			);
			if (existingPhone) {
				throw new ConflictException('Phone number is already in use');
			}
		}

		const hashedPassword = await this.tokenProvider.hashPassword(
			createClientDto.password,
		);

		const client = await this.clientService.create({
			...createClientDto,
			password: hashedPassword,
		});

		// A freshly registered client has no tenant yet; they gain access to a
		// tenant only by accepting an invitation, then switching into it.
		return this.issueTokens(client, null);
	}

	async signInWithGoogle(idToken: string) {
		const payload = await this.verifyGoogleIdToken(idToken);

		const email = payload.email!.toLowerCase().trim();
		const googleId = payload.sub;

		let client = await this.clientService.findByGoogleId(googleId);

		if (!client) {
			const byEmail = await this.clientService.findOneByEmail(email);
			if (byEmail) {
				await this.clientService.updateGoogleInfo(byEmail.id, {
					googleId,
					avatarUrl: byEmail.avatarUrl ?? payload.picture,
				});
				client = await this.clientService.findProfileById(byEmail.id);
			}
		}

		if (!client) {
			client = await this.clientService.create({
				firstName:
					payload.given_name ??
					payload.name?.split(' ')[0] ??
					email.split('@')[0],
				lastName:
					payload.family_name ??
					payload.name?.split(' ').slice(1).join(' ') ??
					'',
				email,
				password: null,
				confirmPassword: null,
			} as unknown as CreateClientDto);
			await this.clientService.updateGoogleInfo(client.id, {
				googleId,
				avatarUrl: payload.picture,
			});
			client = await this.clientService.findProfileById(client.id);
		}

		await this.clientService.updateLastLoginAt(client!.id);
		const tenantId = await this.membershipService.resolveDefaultTenantId(
			client!.id,
		);
		return this.issueTokens(client!, tenantId);
	}

	async login(loginDto: { email: string; password: string }) {
		const client = await this.validateClient(loginDto.email, loginDto.password);
		if (!client) {
			throw new BadRequestException('Invalid credentials');
		}

		await this.clientService.updateLastLoginAt(client.id);
		const tenantId = await this.membershipService.resolveDefaultTenantId(
			client.id,
		);
		return this.issueTokens(client, tenantId);
	}

	/**
	 * Switches the active tenant for an authenticated client. The client must
	 * already hold an active membership in the target tenant; the new token
	 * pair carries that tenant as the active scope.
	 */
	async switchTenant(clientId: string, tenantId: string) {
		const membership = await this.membershipService.findMembership(
			clientId,
			tenantId,
		);
		if (!membership) {
			throw new ForbiddenException('You are not a member of this tenant');
		}
		if (membership.status === MembershipStatus.BLOCKED) {
			throw new ForbiddenException(
				`Access to this tenant is blocked. Reason: ${membership.blockReason || 'No reason provided'}`,
			);
		}
		if (membership.status !== MembershipStatus.ACTIVE) {
			throw new ForbiddenException(
				'Your membership in this tenant is not active',
			);
		}

		const client = await this.clientService.findById(clientId);
		if (!client) {
			throw new NotFoundException('Client not found');
		}

		await this.membershipService.markActiveNow(membership.id);
		return this.issueTokens(client, tenantId);
	}

	listMemberships(clientId: string) {
		return this.membershipService.findMemberships(clientId);
	}

	async refreshTokens(
		clientId: string,
		refreshToken: string,
		tenantId: string | null,
	) {
		const client = await this.clientService.findByIdWithRefreshToken(clientId);
		if (!client || !client.hashedRefreshToken) {
			throw new ForbiddenException('Access denied');
		}

		const isTokenValid = this.tokenProvider.compareToken(
			refreshToken,
			client.hashedRefreshToken,
		);
		if (!isTokenValid) {
			throw new ForbiddenException('Access denied');
		}

		// Preserve whichever tenant the session was already scoped to.
		const payload = this.buildPayload(client, tenantId);
		const tokens = await this.tokenProvider.generateTokens(payload);
		const hashedNewRefreshToken = this.tokenProvider.hashToken(
			tokens.refreshToken,
		);

		await this.clientService.updateRefreshToken(
			client.id,
			hashedNewRefreshToken,
		);
		return tokens;
	}

	async logout(clientId: string) {
		await this.clientService.logout(clientId);
	}

	async forgetPassword(email: string) {
		const genericResponse = {
			message: 'If an account exists, a password reset email has been sent',
		};

		const client = await this.clientService.findOneByEmail(email);
		if (!client) {
			return genericResponse;
		}

		const rawToken = crypto.randomBytes(32).toString('hex');
		const hashedToken = crypto
			.createHash('sha256')
			.update(rawToken)
			.digest('hex');

		await this.clientService.setResetPasswordToken(
			client.id,
			hashedToken,
			new Date(Date.now() + 15 * 60 * 1000),
		);

		return genericResponse;
	}

	async resetPassword(token: string, newPassword: string) {
		const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
		const client = await this.clientService.findByValidResetToken(hashedToken);

		if (!client) {
			throw new ForbiddenException('Invalid or expired password reset token');
		}

		const hashedPassword = await this.tokenProvider.hashPassword(newPassword);
		await this.clientService.resetClientPassword(client.id, hashedPassword);
		return { message: 'Password reset successful' };
	}

	async getMe(clientId: string) {
		const client = await this.clientService.findProfileById(clientId);
		if (!client) {
			throw new NotFoundException('Client not found');
		}
		return client;
	}

	private async verifyGoogleIdToken(idToken: string): Promise<TokenPayload> {
		let ticket: LoginTicket;
		try {
			ticket = await this.googleClient.verifyIdToken({
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

	private async validateClient(
		email: string,
		password: string,
	): Promise<Client | null> {
		const client = await this.clientService.findOneByEmail(email);
		if (!client || !client.password) {
			return null;
		}

		const isPasswordValid = await this.tokenProvider.comparePassword(
			password,
			client.password,
		);
		if (!isPasswordValid) {
			return null;
		}
		return client;
	}

	private async issueTokens(client: Client, tenantId: string | null) {
		const payload = this.buildPayload(client, tenantId);
		const tokens = await this.tokenProvider.generateTokens(payload);
		const hashedRefreshToken = this.tokenProvider.hashToken(
			tokens.refreshToken,
		);

		await this.clientService.updateRefreshToken(client.id, hashedRefreshToken);
		//added a fix here ya DOD becuase the password was being returned in the client login reposne
		const {
			password,
			hashedRefreshToken: _hrt,
			resetPasswordToken,
			resetPasswordExpires,
			...safeClient
		} = client;

		return { client: safeClient, ...tokens };
	}

	private buildPayload(
		client: Client,
		tenantId: string | null,
	): ClientAuthPayload {
		return {
			clientId: client.id,
			tenantId: tenantId,
			email: client.email,
			type: 'client',
		};
	}
}
