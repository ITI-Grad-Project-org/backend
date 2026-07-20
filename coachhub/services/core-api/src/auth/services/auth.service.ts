import {
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { TokenProvider } from '../providers/token.provider';
import { AuthPayload } from 'src/common/interfaces/authPayload.interface';
import { LoginDto } from '../dto/login.dto';
import { Coach } from '../../coaches/entities/coach.entity';
import { RegisterCoachDto } from '../../coaches/dto/register-coach.dto';
import { CoachesService } from '../../coaches/coaches.service';
import { EventPublisherService } from '../../messaging/event-publisher.service';
import { EventType } from '../../messaging/events';
import { PasswordResetOtpProvider } from '../providers/password-reset-otp.provider';

@Injectable()
export class AuthService {
	constructor(
		private readonly coachesService: CoachesService,
		private readonly tokenProvider: TokenProvider,
		private readonly eventPublisherService: EventPublisherService,
		private readonly otpProvider: PasswordResetOtpProvider,
	) {}

	async register(registerDto: RegisterCoachDto) {
		const existingCoach = await this.coachesService.findOneByEmail(
			registerDto.email,
		);

		if (existingCoach) {
			throw new ConflictException('Email is already in use');
		}

		if (registerDto.phone) {
			const existingPhone = await this.coachesService.findOneByPhone(
				registerDto.phone,
			);
			if (existingPhone) {
				throw new ConflictException('Phone number is already in use');
			}
		}

		const hashedPassword = await this.tokenProvider.hashPassword(
			registerDto.password,
		);

		const coach = await this.coachesService.create({
			...registerDto,
			password: hashedPassword,
		});

		const result = await this.issueTokens(coach);
		return { user: coach, ...result };
	}

	async login(loginDto: LoginDto) {
		const { email, password } = loginDto;
		const coach = await this.coachesService.findOneByEmail(email);
		if (!coach) {
			throw new UnauthorizedException('Invalid credentials');
		}

		const validatedCoach = await this.validateCoach(email, password);
		if (!validatedCoach) {
			throw new UnauthorizedException('Invalid credentials');
		}
		return this.issueTokens(validatedCoach);
	}

	async refreshTokens(coachId: string, refreshToken: string) {
		const coach = await this.coachesService.findByIdWithRefreshToken(coachId);

		const isTokenValid = this.tokenProvider.compareToken(
			refreshToken,
			coach.hashedRefreshToken,
		);
		if (!isTokenValid) {
			throw new ForbiddenException('Access denied');
		}

		const payload = this.buildPayload(coach);
		const tokens = await this.tokenProvider.generateTokens(payload);
		const hashedNewRefreshToken = this.tokenProvider.hashToken(
			tokens.refreshToken,
		);

		await this.coachesService.updateRefreshToken(
			coach.id,
			hashedNewRefreshToken,
		);

		return tokens;
	}

	async logout(coachId: string) {
		await this.coachesService.logout(coachId);
	}

	async forgetPassword(email: string) {
		// Always identical, so the endpoint can't be used to enumerate accounts.
		const genericResponse = {
			message: 'If an account exists, a password reset code has been sent',
		};

		const coach = await this.coachesService.findOneByEmail(email);
		if (!coach) {
			return genericResponse;
		}

		const otp = this.otpProvider.generateOtp();

		await this.coachesService.setResetOtp(
			coach.id,
			this.otpProvider.hash(otp),
			this.otpProvider.otpExpiry(),
		);

		await this.eventPublisherService.publish(
			EventType.PASSWORD_RESET,
			{
				email: coach.email,
				name: `${coach.firstName} ${coach.lastName}`.trim(),
				otp,
				expiresInMinutes: this.otpProvider.ttlMinutes,
			},
			{ tenantId: coach.tenants?.[0]?.id ?? 'system' },
		);

		return genericResponse;
	}

	/**
	 * Stage 1 → 2. Exchanges a valid OTP for a single-use reset ticket so the
	 * app can tell the user "wrong code" before showing the new-password screen.
	 */
	async verifyResetOtp(email: string, otp: string) {
		const invalid = new ForbiddenException('Invalid or expired reset code');

		const coach = await this.coachesService.findOneByEmailWithResetOtp(email);
		if (!coach?.resetOtpHash || !coach.resetOtpExpires) {
			throw invalid;
		}

		if (coach.resetOtpExpires.getTime() <= Date.now()) {
			await this.coachesService.clearResetOtp(coach.id);
			throw invalid;
		}

		// Burn the code once it has been guessed at too many times.
		if (coach.resetOtpAttempts >= PasswordResetOtpProvider.MAX_ATTEMPTS) {
			await this.coachesService.clearResetOtp(coach.id);
			throw new ForbiddenException(
				'Too many incorrect attempts. Please request a new code.',
			);
		}

		if (!this.otpProvider.matches(otp, coach.resetOtpHash)) {
			await this.coachesService.incrementResetOtpAttempts(coach.id);
			throw invalid;
		}

		// Correct code: consume it so it can never be replayed, and issue the ticket.
		const resetToken = this.otpProvider.generateTicket();
		await this.coachesService.setResetPasswordToken(
			coach.id,
			this.otpProvider.hash(resetToken),
			this.otpProvider.ticketExpiry(),
		);
		await this.coachesService.clearResetOtp(coach.id);

		return { resetToken };
	}

	async resetPassword(resetToken: string, newPassword: string) {
		const coach = await this.coachesService.findByValidResetToken(
			this.otpProvider.hash(resetToken),
		);

		if (!coach) {
			throw new ForbiddenException('Invalid or expired password reset token');
		}

		const hashedPassword = await this.tokenProvider.hashPassword(newPassword);
		await this.coachesService.resetCoachPassword(coach.id, hashedPassword);
		return { message: 'Password reset successful' };
	}

	async getMe(coachId: string) {
		const coach = await this.coachesService.findProfileById(coachId);
		if (!coach) {
			throw new NotFoundException('Coach not found');
		}
		return coach;
	}

	private async validateCoach(
		email: string,
		password: string,
	): Promise<Coach | null> {
		const coach = await this.coachesService.findOneByEmail(email);

		if (!coach) {
			return null;
		}

		const isPasswordValid = await this.tokenProvider.comparePassword(
			password,
			coach.password,
		);
		if (!isPasswordValid) {
			return null;
		}
		return coach;
	}

	private buildPayload(coach: Coach): AuthPayload {
		return {
			userId: coach.id,
			email: coach.email,
			tenantId: coach.tenants?.[0]?.id,
			type: 'tenant-user',
		};
	}

	private async issueTokens(coach: Coach) {
		const payload = this.buildPayload(coach);
		const tokens = await this.tokenProvider.generateTokens(payload);
		const hashedRefreshToken = this.tokenProvider.hashToken(
			tokens.refreshToken,
		);

		await this.coachesService.updateRefreshToken(coach.id, hashedRefreshToken);

		// TODO(auth-security): Return a sanitized coach response instead of the
		// login entity, because findOneByEmail selects the password hash.
		return { user: coach, ...tokens };
	}
}
