import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
}                           from '@nestjs/common';
import { TokenProvider }    from '../providers/token.provider';
import { AuthPayload }      from 'src/common/interfaces/authPayload.interface';
import { LoginDto }         from '../dto/login.dto';
import * as crypto          from 'crypto';
import { Coach }            from '../../coaches/entities/coach.entity';
import { RegisterCoachDto } from '../../coaches/dto/register-coach.dto';
import { CoachesService }   from '../../coaches/coaches.service';

@Injectable()
export class AuthService {
	constructor (
		private readonly coachesService: CoachesService,
		private readonly tokenProvider: TokenProvider,
	) {}

	async register ( registerDto: RegisterCoachDto ) {

		const existingCoach = await this.coachesService.findOneByEmail(
			registerDto.email
		);

		if ( existingCoach ) {
			throw new BadRequestException( 'Email is already in use' );
		}

		const hashedPassword = await this.tokenProvider.hashPassword(
			registerDto.password,
		);

		const coach = await this.coachesService.create(
			{ ...registerDto, password: hashedPassword } );

		const result = await this.issueTokens( coach );
		return { user: coach, ...result };
	}

	async login ( loginDto: LoginDto ) {
		const { email, password } = loginDto;
		const coach = await this.coachesService.findOneByEmail( email );
		if ( !coach ) {
			throw new UnauthorizedException( 'Invalid credentials' );
		}

		const validatedCoach = await this.validateCoach( email, password );
		if ( !validatedCoach ) {
			throw new UnauthorizedException( 'Invalid credentials' );
		}
		return this.issueTokens( validatedCoach );
	}

	async refreshTokens ( coachId: string, refreshToken: string ) {
		const coach = await this.coachesService.findByIdWithRefreshToken( coachId );

		const isTokenValid = this.tokenProvider.compareToken(
			refreshToken,
			coach.hashedRefreshToken,
		);
		if ( !isTokenValid ) {
			throw new ForbiddenException( 'Access denied' );
		}

		const payload = this.buildPayload( coach );
		const tokens = await this.tokenProvider.generateTokens( payload );
		const hashedNewRefreshToken = this.tokenProvider.hashToken(
			tokens.refreshToken,
		);

		await this.coachesService.updateRefreshToken(
			coach.id,
			hashedNewRefreshToken,
		);

		return tokens;
	}

	async logout ( coachId: string ) {
		await this.coachesService.logout(
			coachId
		);
	}

	async forgetPassword ( email: string ) {
		const genericResponse = {
			message: 'If an account exists, a password reset email has been sent',
		};

		const coach = await this.coachesService.findOneByEmail( email );
		if ( !coach ) {
			return genericResponse;
		}

		const rawToken = crypto.randomBytes( 32 ).toString( 'hex' );
		const hashedToken = crypto
			.createHash( 'sha256' )
			.update( rawToken )
			.digest( 'hex' );

		await this.coachesService.setResetPasswordToken(
			coach.id,
			hashedToken,
			new Date( Date.now() + 15 * 60 * 1000 ),
		);

		return genericResponse;
	}

	async resetPassword ( token: string, newPassword: string ) {
		const hashedToken = crypto.createHash( 'sha256' ).update( token ).digest( 'hex' );
		const coach = await this.coachesService.findByValidResetToken( hashedToken );

		if ( !coach ) {
			throw new ForbiddenException( 'Invalid or expired password reset token' );
		}

		const hashedPassword = await this.tokenProvider.hashPassword( newPassword );
		await this.coachesService.resetCoachPassword( coach.id, hashedPassword );
		return { message: 'Password reset successful' };
	}

	async getMe ( coachId: string ) {
		const coach = await this.coachesService.findProfileById( coachId );
		if ( !coach ) {
			throw new NotFoundException( 'Coach not found' );
		}
		return coach;
	}

	private async validateCoach (
		email: string,
		password: string,
	): Promise<Coach | null> {
		const coach = await this.coachesService.findOneByEmail( email );

		if ( !coach ) {
			return null;
		}

		const isPasswordValid = await this.tokenProvider.comparePassword(
			password,
			coach.password,
		);
		if ( !isPasswordValid ) {
			return null;
		}
		return coach;
	}

	private buildPayload ( coach: Coach ): AuthPayload {
		return {
			userId: coach.id,
			email: coach.email,
			tenantId: coach.tenants?.[0]?.id,
			type: 'tenant-user',
		};
	}

	private async issueTokens ( coach: Coach ) {
		const payload = this.buildPayload( coach );
		const tokens = await this.tokenProvider.generateTokens( payload );
		const hashedRefreshToken = this.tokenProvider.hashToken( tokens.refreshToken );

		await this.coachesService.updateRefreshToken( coach.id, hashedRefreshToken );

		return { user: coach, ...tokens };
	}
}
