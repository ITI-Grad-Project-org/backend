import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
	UnauthorizedException,
}                                                  from '@nestjs/common';
import { LoginTicket, OAuth2Client, TokenPayload } from 'google-auth-library';
import * as crypto                                 from 'crypto';
import { TokenProvider }                           from '../providers/token.provider';
import { UserStatus }                              from '../enums';
import { ConfigService }                           from 'src/config';
import { ClientAuthPayload }                       from '../../common';
import { ClientService }                           from '../../clients/client.service';
import { Client }                                  from '../../clients/entities/client.entity';
import { CreateClientDto }                         from '../../clients/dto/create-client.dto';

@Injectable()
export class ClientAuthService {
	private readonly logger = new Logger( ClientAuthService.name );
	private readonly googleClient: OAuth2Client;

	constructor (
		private readonly clientService: ClientService,
		private readonly tokenProvider: TokenProvider,
		private readonly configService: ConfigService,
	) {
		this.googleClient = new OAuth2Client(
			this.configService.googleOauthConfig.clientId,
		);
	}

	async register ( createClientDto: CreateClientDto ) {
		const existing = await this.clientService.findOneByEmail( createClientDto.email );
		if ( existing ) {
			throw new BadRequestException( 'Email already in use' );
		}

		const hashedPassword = await this.tokenProvider.hashPassword( createClientDto.password );

		const client = await this.clientService.create( {
			...createClientDto,
			password: hashedPassword,
		} );

		return this.issueTokens( client );
	}

	async signInWithGoogle ( idToken: string ) {
		const payload = await this.verifyGoogleIdToken( idToken );

		const email    = payload.email!.toLowerCase().trim();
		const googleId = payload.sub;

		let client = await this.clientService.findByGoogleId( googleId );

		if ( !client ) {
			const byEmail = await this.clientService.findOneByEmail( email );
			if ( byEmail ) {
				await this.clientService.updateGoogleInfo( byEmail.id, {
					googleId,
					profilePicture: byEmail.profilePicture ?? payload.picture,
				} );
				client = await this.clientService.findProfileById( byEmail.id );
			}
		}

		if ( !client ) {
			client = await this.clientService.create( {
				name: payload.name ?? email.split( '@' )[0],
				email,
				password: null,
				confirmPassword: null,
				tenantId: null,
			} as unknown as CreateClientDto );
			await this.clientService.updateGoogleInfo( client.id, {
				googleId,
				profilePicture: payload.picture,
			} );
			client = await this.clientService.findProfileById( client.id );
		}

		if ( client!.status === UserStatus.BLOCKED ) {
			throw new ForbiddenException(
				`Client is blocked. Reason: ${ client!.blockReason || 'No reason provided' }`,
			);
		}

		await this.clientService.updateLastLoginAt( client!.id );
		return this.issueTokens( client! );
	}

	async login ( loginDto: { email: string; password: string } ) {
		const client = await this.validateClient( loginDto.email, loginDto.password );
		if ( !client ) {
			throw new BadRequestException( 'Invalid credentials' );
		}
		if ( client.status === UserStatus.BLOCKED ) {
			throw new ForbiddenException(
				`Client is blocked. Reason: ${ client.blockReason || 'No reason provided' }`,
			);
		}

		await this.clientService.updateLastLoginAt( client.id );
		return this.issueTokens( client );
	}

	async refreshTokens ( clientId: string, refreshToken: string ) {
		const client = await this.clientService.findByIdWithRefreshToken( parseInt( clientId ) );
		if (
			!client ||
			!client.hashedRefreshToken ||
			client.status === UserStatus.BLOCKED
		) {
			throw new ForbiddenException( 'Access denied' );
		}

		const isTokenValid = this.tokenProvider.compareToken(
			refreshToken,
			client.hashedRefreshToken,
		);
		if ( !isTokenValid ) {
			throw new ForbiddenException( 'Access denied' );
		}

		const payload                = this.buildPayload( client );
		const tokens                 = await this.tokenProvider.generateTokens( payload );
		const hashedNewRefreshToken  = this.tokenProvider.hashToken( tokens.refreshToken );

		await this.clientService.updateRefreshToken( client.id, hashedNewRefreshToken );
		return tokens;
	}

	async logout ( clientId: string ) {
		await this.clientService.logout( parseInt( clientId ) );
	}

	async forgetPassword ( email: string ) {
		const genericResponse = {
			message: 'If an account exists, a password reset email has been sent',
		};

		const client = await this.clientService.findOneByEmail( email );
		if ( !client ) {
			return genericResponse;
		}

		const rawToken    = crypto.randomBytes( 32 ).toString( 'hex' );
		const hashedToken = crypto.createHash( 'sha256' ).update( rawToken ).digest( 'hex' );

		await this.clientService.setResetPasswordToken(
			client.id,
			hashedToken,
			new Date( Date.now() + 15 * 60 * 1000 ),
		);

		return genericResponse;
	}

	async resetPassword ( token: string, newPassword: string ) {
		const hashedToken = crypto.createHash( 'sha256' ).update( token ).digest( 'hex' );
		const client      = await this.clientService.findByValidResetToken( hashedToken );

		if ( !client ) {
			throw new ForbiddenException( 'Invalid or expired password reset token' );
		}

		const hashedPassword = await this.tokenProvider.hashPassword( newPassword );
		await this.clientService.resetClientPassword( client.id, hashedPassword );
		return { message: 'Password reset successful' };
	}

	async getMe ( clientId: string ) {
		const client = await this.clientService.findProfileById( parseInt( clientId ) );
		if ( !client ) {
			throw new NotFoundException( 'Client not found' );
		}
		return client;
	}

	private async verifyGoogleIdToken ( idToken: string ): Promise<TokenPayload> {
		let ticket: LoginTicket;
		try {
			ticket = await this.googleClient.verifyIdToken( {
				idToken,
				audience: this.configService.googleOauthConfig.clientId,
			} );
		} catch ( err ) {
			const message = err instanceof Error ? err.message : String( err );
			this.logger.warn( `Google ID token verification failed: ${ message }` );
			throw new UnauthorizedException( 'Invalid Google ID token' );
		}

		const payload = ticket.getPayload();
		if ( !payload || !payload.sub || !payload.email ) {
			throw new UnauthorizedException( 'Invalid Google ID token payload' );
		}
		if ( !payload.email_verified ) {
			throw new UnauthorizedException( 'Google email is not verified' );
		}
		return payload;
	}

	private async validateClient (
		email: string,
		password: string,
	): Promise<Client | null> {
		const client = await this.clientService.findOneByEmail( email );
		if ( !client || !client.password ) {
			return null;
		}

		const isPasswordValid = await this.tokenProvider.comparePassword( password, client.password );
		if ( !isPasswordValid ) {
			return null;
		}
		return client;
	}

	private async issueTokens ( client: Client ) {
		const payload          = this.buildPayload( client );
		const tokens           = await this.tokenProvider.generateTokens( payload );
		const hashedRefreshToken = this.tokenProvider.hashToken( tokens.refreshToken );

		await this.clientService.updateRefreshToken( client.id, hashedRefreshToken );
		return { client, ...tokens };
	}

	private buildPayload ( client: Client ): ClientAuthPayload {
		return {
			clientId: client.id.toString(),
			tenantId: client.tenant?.id?.toString() ?? null,
			email:    client.email,
			type:     'client',
		};
	}
}
