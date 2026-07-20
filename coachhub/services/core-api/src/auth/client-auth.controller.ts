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
import { ClientAuthService } from './services/client-auth.service';
import { CreateClientDto } from '../clients/dto/create-client.dto';
import { ClientLoginDto } from './dto/client-login.dto';
import { ForgetPasswordDto } from './dto/forget-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { ClientJwtAuthGuard } from './guards/client-jwt-auth.guard';
import { ClientJwtRefreshGuard } from './guards/client-jwt-refresh.guard';
import { CurrentClient, Public } from './decorators';
import { SwitchTenantDto } from './dto/switch-tenant.dto';

@Public()
@ApiTags('Customer Auth')
@Controller('auth/customer')
export class ClientAuthController {
	constructor(private readonly customerAuthService: ClientAuthService) {}

	@Throttle({ default: { ttl: 60_000, limit: 10 } })
	@Post('register')
	@ApiOperation({ summary: 'Register a new customer (buyer) account' })
	@ApiBody({
		type: CreateClientDto,
		examples: {
			required: {
				summary: 'Required fields only',
				description: 'Optional extra (phone) is listed in the schema.',
				value: {
					firstName: 'Alice',
					lastName: 'Smith',
					email: 'alice@example.com',
					password: 'password123',
					confirmPassword: 'password123',
				},
			},
		},
	})
	@ApiResponse({ status: 201, description: 'Customer registered successfully' })
	@ApiResponse({ status: 400, description: 'Validation error' })
	@ApiResponse({
		status: 409,
		description: 'Email or phone number already in use',
	})
	@HttpCode(HttpStatus.CREATED)
	register(@Body() createClientDto: CreateClientDto) {
		return this.customerAuthService.register(createClientDto);
	}

	@Throttle({ default: { ttl: 60_000, limit: 10 } })
	@Post('login')
	@ApiOperation({ summary: 'Customer login with email and password' })
	@ApiBody({ type: ClientLoginDto })
	@ApiResponse({ status: 200, description: 'Logged in successfully' })
	@ApiResponse({ status: 401, description: 'Invalid credentials' })
	@HttpCode(HttpStatus.OK)
	login(@Body() customerLoginDto: ClientLoginDto) {
		return this.customerAuthService.login(customerLoginDto);
	}

	@Throttle({ default: { ttl: 60_000, limit: 10 } })
	@Post('google')
	@ApiOperation({
		summary: 'Customer sign in or register with a Google ID token',
		description:
			'Pass an ID token obtained from the Google Sign-In SDK. If an account with the email already exists it is auto-linked to the Google identity; otherwise a new customer is created.',
	})
	@ApiBody({ type: GoogleAuthDto })
	@ApiResponse({ status: 200, description: 'Signed in successfully' })
	@ApiResponse({ status: 401, description: 'Invalid Google ID token' })
	@ApiResponse({ status: 403, description: 'Customer is blocked' })
	@HttpCode(HttpStatus.OK)
	google(@Body() dto: GoogleAuthDto) {
		return this.customerAuthService.signInWithGoogle(dto.idToken);
	}

	@UseGuards(ClientJwtRefreshGuard)
	@Post('refresh')
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Refresh customer access and refresh tokens' })
	@ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
	@ApiResponse({ status: 403, description: 'Access denied' })
	@HttpCode(HttpStatus.OK)
	refresh(@Req() req: any) {
		return this.customerAuthService.refreshTokens(
			req.user.clientId,
			req.user.refreshToken,
			req.user.tenantId,
		);
	}

	@UseGuards(ClientJwtAuthGuard)
	@Get('memberships')
	@ApiBearerAuth()
	@ApiOperation({
		summary: 'List the tenants this customer belongs to (for switching)',
	})
	@ApiResponse({ status: 200, description: 'Memberships retrieved' })
	@HttpCode(HttpStatus.OK)
	memberships(@CurrentClient('clientId') clientId: string) {
		return this.customerAuthService.listMemberships(clientId);
	}

	@UseGuards(ClientJwtAuthGuard)
	@Post('switch-tenant')
	@ApiBearerAuth()
	@ApiOperation({
		summary: 'Switch the active tenant and receive a re-scoped token pair',
	})
	@ApiBody({ type: SwitchTenantDto })
	@ApiResponse({ status: 200, description: 'Switched tenant successfully' })
	@ApiResponse({ status: 403, description: 'Not a member of this tenant' })
	@HttpCode(HttpStatus.OK)
	switchTenant(
		@CurrentClient('clientId') clientId: string,
		@Body() switchTenantDto: SwitchTenantDto,
	) {
		return this.customerAuthService.switchTenant(
			clientId,
			switchTenantDto.tenantId,
		);
	}

	@UseGuards(ClientJwtAuthGuard)
	@Post('logout')
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Customer logout' })
	@ApiResponse({ status: 200, description: 'Logged out successfully' })
	@HttpCode(HttpStatus.OK)
	logout(@CurrentClient('clientId') clientId: string) {
		return this.customerAuthService.logout(clientId);
	}

	@Throttle({ default: { ttl: 60_000, limit: 5 } })
	@Post('forgot-password')
	@ApiOperation({
		summary: 'Email a 6-digit password reset code to the client',
	})
	@ApiBody({ type: ForgetPasswordDto })
	@ApiResponse({
		status: 200,
		description: 'Reset code sent if account exists',
	})
	@ApiResponse({ status: 400, description: 'Validation error' })
	@HttpCode(HttpStatus.OK)
	forgotPassword(@Body() forgetPasswordDto: ForgetPasswordDto) {
		return this.customerAuthService.forgetPassword(forgetPasswordDto.email);
	}

	// Tighter than the other reset endpoints: this is the one an attacker would
	// hammer to guess a 6-digit code (per-account attempts are capped too).
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
		return this.customerAuthService.verifyResetOtp(
			verifyResetOtpDto.email,
			verifyResetOtpDto.otp,
		);
	}

	@Throttle({ default: { ttl: 60_000, limit: 10 } })
	@Post('reset-password')
	@ApiOperation({ summary: 'Set a new client password using the reset token' })
	@ApiBody({ type: ResetPasswordDto })
	@ApiResponse({ status: 200, description: 'Password reset successfully' })
	@ApiResponse({ status: 403, description: 'Invalid or expired reset token' })
	@HttpCode(HttpStatus.OK)
	resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
		return this.customerAuthService.resetPassword(
			resetPasswordDto.resetToken,
			resetPasswordDto.newPassword,
		);
	}

	@UseGuards(ClientJwtAuthGuard)
	@Get('me')
	@ApiBearerAuth()
	@ApiOperation({ summary: 'Get the currently authenticated customer profile' })
	@ApiResponse({ status: 200, description: 'Customer profile retrieved' })
	@HttpCode(HttpStatus.OK)
	getMe(@CurrentClient('clientId') clientId: string) {
		return this.customerAuthService.getMe(clientId);
	}
}
