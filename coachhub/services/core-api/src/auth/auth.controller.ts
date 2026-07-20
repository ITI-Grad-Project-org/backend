import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Post,
	Req,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiBody,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './services/auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgetPasswordDto } from './dto/forget-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto';
import { AuthPayload } from 'src/common/interfaces/authPayload.interface';
import { JwtAuthGuard, JwtRefreshGuard } from './guards';
import { CurrentUser, Public } from './decorators';
import { RegisterCoachDto } from '../coaches/dto/register-coach.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Public()
	@Throttle({ default: { ttl: 60_000, limit: 10 } })
	@Post('register')
	@ApiOperation({
		summary:
			'Register a new coach (auto-creates their tenant and seeds the exercise library)',
	})
	@ApiBody({
		type: RegisterCoachDto,
		examples: {
			required: {
				summary: 'Required fields only',
				description:
					'Optional extras (phone, bio, specialties, yearsExperience, certifications, timezone, currency) are listed in the schema.',
				value: {
					firstName: 'Jane',
					lastName: 'Smith',
					email: 'jane@acme.com',
					password: 'password123',
					confirmPassword: 'password123',
					businessName: 'Iron Temple Coaching',
				},
			},
		},
	})
	@ApiResponse({
		status: 201,
		description: 'Coach and tenant registered successfully',
	})
	@ApiResponse({
		status: 400,
		description: 'Validation error',
	})
	@ApiResponse({
		status: 409,
		description: 'Email or phone number already in use',
	})
	@HttpCode(HttpStatus.CREATED)
	register(@Body() registerDto: RegisterCoachDto) {
		return this.authService.register(registerDto);
	}

	@Public()
	@Throttle({ default: { ttl: 60_000, limit: 10 } })
	@Post('login')
	@ApiOperation({ summary: 'Login with email and password' })
	@ApiBody({ type: LoginDto })
	@ApiResponse({ status: 200, description: 'Logged in successfully' })
	@ApiResponse({ status: 401, description: 'Invalid credentials' })
	@ApiResponse({ status: 400, description: 'Validation error' })
	@HttpCode(HttpStatus.OK)
	login(@Body() loginDto: LoginDto) {
		return this.authService.login(loginDto);
	}

	@Public()
	@UseGuards(JwtRefreshGuard)
	@Post('refresh')
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Refresh access and refresh tokens' })
	@ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
	@ApiResponse({ status: 403, description: 'Access denied' })
	@HttpCode(HttpStatus.OK)
	refresh(@Req() req: any) {
		return this.authService.refreshTokens(
			req.user.userId,
			req.user.refreshToken,
		);
	}

	@UseGuards(JwtAuthGuard)
	@Post('logout')
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Logout and invalidate refresh token' })
	@ApiResponse({ status: 200, description: 'Logged out successfully' })
	@HttpCode(HttpStatus.OK)
	logout(@CurrentUser('userId') userId: string) {
		return this.authService.logout(userId);
	}

	@Public()
	@Throttle({ default: { ttl: 60_000, limit: 5 } })
	@Post('forgot-password')
	@ApiOperation({ summary: 'Email a 6-digit password reset code' })
	@ApiBody({ type: ForgetPasswordDto })
	@ApiResponse({
		status: 200,
		description: 'Reset code sent if account exists',
	})
	@ApiResponse({ status: 400, description: 'Validation error' })
	@HttpCode(HttpStatus.OK)
	forgotPassword(@Body() forgetPasswordDto: ForgetPasswordDto) {
		return this.authService.forgetPassword(forgetPasswordDto.email);
	}

	// Tighter than the other reset endpoints: this is the one an attacker would
	// hammer to guess a 6-digit code (per-account attempts are capped too).
	@Public()
	@Throttle({ default: { ttl: 60_000, limit: 5 } })
	@Post('verify-reset-otp')
	@ApiOperation({ summary: 'Exchange a valid reset code for a reset token' })
	@ApiBody({ type: VerifyResetOtpDto })
	@ApiResponse({ status: 200, description: 'Returns a single-use resetToken' })
	@ApiResponse({
		status: 403,
		description: 'Invalid, expired, or exhausted code',
	})
	@HttpCode(HttpStatus.OK)
	verifyResetOtp(@Body() verifyResetOtpDto: VerifyResetOtpDto) {
		return this.authService.verifyResetOtp(
			verifyResetOtpDto.email,
			verifyResetOtpDto.otp,
		);
	}

	@Public()
	@Throttle({ default: { ttl: 60_000, limit: 10 } })
	@Post('reset-password')
	@ApiOperation({ summary: 'Set a new password using the reset token' })
	@ApiBody({ type: ResetPasswordDto })
	@ApiResponse({ status: 200, description: 'Password reset successfully' })
	@ApiResponse({ status: 403, description: 'Invalid or expired reset token' })
	@HttpCode(HttpStatus.OK)
	resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
		return this.authService.resetPassword(
			resetPasswordDto.resetToken,
			resetPasswordDto.newPassword,
		);
	}

	@UseGuards(JwtAuthGuard)
	@Get('me')
	@ApiBearerAuth()
	@ApiOperation({
		summary:
			'Get current authenticated user profile, including currentTenant and memberships',
	})
	@ApiResponse({ status: 200, description: 'User info retrieved successfully' })
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	getProfile(@CurrentUser() user: AuthPayload) {
		return this.authService.getMe(user.userId);
	}
}
