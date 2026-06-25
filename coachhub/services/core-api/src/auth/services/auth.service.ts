import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
}                        from '@nestjs/common';
import { TenantService } from '../../tenant/tenant.service';
import { TokenProvider } from '../providers/token.provider';
import { AuthPayload }   from 'src/common/interfaces/authPayload.interface';
import { LoginDto }      from '../dto/login.dto';
import * as crypto       from 'crypto';
import { User }          from '../../users/entities/user.entity';
import { RegisterDto }   from '../../users/dto/register-user.dto';
import { UsersService }  from '../../users/users.service';

@Injectable()
export class AuthService {
	constructor (
		private readonly userService: UsersService,
		private readonly tenantService: TenantService,
		private readonly tokenProvider: TokenProvider,
	) {}

	async register ( registerDto: RegisterDto ) {

		const existingUser = await this.userService.findOneByEmail(
			registerDto.email
		);

		if ( existingUser ) {
			throw new BadRequestException( 'Email is already in use' );
		}

		const hashedPassword = await this.tokenProvider.hashPassword(
			registerDto.password,
		);

		const user = await this.userService.create(
			{ ...registerDto, password: hashedPassword } );

		const result = await this.issueTokens( user );
		return { user, ...result };
	}

	async login ( loginDto: LoginDto ) {
		const { email, password } = loginDto;
		const user = await this.userService.findOneByEmail( email );
		if ( !user ) {
			throw new UnauthorizedException( 'Invalid credentials' );
		}

		const validatedUser = await this.validateUser( email, password );
		if ( !validatedUser ) {
			throw new UnauthorizedException( 'Invalid credentials' );
		}
		return this.issueTokens( validatedUser );
	}

	async refreshTokens ( userId: number, refreshToken: string ) {
		const user = await this.userService.findByIdWithRefreshToken( userId );

		const isTokenValid = this.tokenProvider.compareToken(
			refreshToken,
			user.hashedRefreshToken,
		);
		if ( !isTokenValid ) {
			throw new ForbiddenException( 'Access denied' );
		}

		const payload = this.buildPayload( user );
		const tokens = await this.tokenProvider.generateTokens( payload );
		const hashedNewRefreshToken = this.tokenProvider.hashToken(
			tokens.refreshToken,
		);

		await this.userService.updateRefreshToken(
			user.id,
			hashedNewRefreshToken,
		);

		return tokens;
	}

	async logout ( userId: number ) {
		await this.userService.logout(
			userId
		);
	}

	async forgetPassword ( email: string ) {
		const genericResponse = {
			message: 'If an account exists, a password reset email has been sent',
		};

		const user = await this.userService.findOneByEmail( email );
		if ( !user ) {
			return genericResponse;
		}

		const rawToken = crypto.randomBytes( 32 ).toString( 'hex' );
		const hashedToken = crypto
			.createHash( 'sha256' )
			.update( rawToken )
			.digest( 'hex' );

		await this.userService.setResetPasswordToken(
			user.id,
			hashedToken,
			new Date( Date.now() + 15 * 60 * 1000 ),
		);

		return genericResponse;
	}

	async resetPassword ( token: string, newPassword: string ) {
		const hashedToken = crypto.createHash( 'sha256' ).update( token ).digest( 'hex' );
		const user = await this.userService.findByValidResetToken( hashedToken );

		if ( !user ) {
			throw new ForbiddenException( 'Invalid or expired password reset token' );
		}

		const hashedPassword = await this.tokenProvider.hashPassword( newPassword );
		await this.userService.resetUserPassword( user.id, hashedPassword );
		return { message: 'Password reset successful' };
	}

	async getMe ( userId: number ) {
		const user = await this.userService.findProfileById( userId );
		if ( !user ) {
			throw new NotFoundException( 'User not found' );
		}
		return user;
	}

	private async validateUser (
		email: string,
		password: string,
	): Promise<User | null> {
		const user = await this.userService.findOneByEmail( email );

		if ( !user ) {
			return null;
		}

		const isPasswordValid = await this.tokenProvider.comparePassword(
			password,
			user.password,
		);
		if ( !isPasswordValid ) {
			return null;
		}
		return user;
	}

	private buildPayload ( user: User ): AuthPayload {
		return {
			userId: user.id,
			email: user.email,
			tenantId: user.tenant.id,
			type: 'tenant-user',
		};
	}

	private async issueTokens ( user: User ) {
		const payload = this.buildPayload( user );
		const tokens = await this.tokenProvider.generateTokens( payload );
		const hashedRefreshToken = this.tokenProvider.hashToken( tokens.refreshToken );

		await this.userService.updateRefreshToken( user.id, hashedRefreshToken );

		return { user, ...tokens };
	}
}
