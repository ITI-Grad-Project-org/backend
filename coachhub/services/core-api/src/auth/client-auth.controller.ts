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
import {
	Throttle
} from '@nestjs/throttler';
import {
	ClientAuthService
} from './services/client-auth.service';
import {
	CreateClientDto
} from '../clients/dto/create-client.dto';
import {
	ClientLoginDto
} from './dto/client-login.dto';
import {
	ForgetPasswordDto
} from './dto/forget-password.dto';
import {
	ResetPasswordDto
} from './dto/reset-password.dto';
import {
	GoogleAuthDto
} from './dto/google-auth.dto';
import {
	ClientJwtAuthGuard
} from './guards/client-jwt-auth.guard';
import {
	ClientJwtRefreshGuard
} from './guards/client-jwt-refresh.guard';
import {
	CurrentClient,
	Public
} from './decorators';
import {
	SwitchTenantDto
} from './dto/switch-tenant.dto';

@Public()
@ApiTags( 'Customer Auth' )
@Controller( 'auth/customer' )
export class ClientAuthController {
	constructor ( private readonly customerAuthService: ClientAuthService ) {}

	@Throttle( { default: { ttl: 60_000, limit: 10 } } )
	@Post( 'register' )
	@ApiOperation( { summary: 'Register a new customer (buyer) account' } )
	@ApiResponse(
		{ status: 201, description: 'Customer registered successfully' } )
	@ApiResponse(
		{ status: 400, description: 'Validation error or email taken' } )
	@HttpCode( HttpStatus.CREATED )
	register ( @Body() createClientDto: CreateClientDto ) {
		return this.customerAuthService.register( createClientDto );
	}

	@Throttle( { default: { ttl: 60_000, limit: 10 } } )
	@Post( 'login' )
	@ApiOperation( { summary: 'Customer login with email and password' } )
	@ApiBody( { type: ClientLoginDto } )
	@ApiResponse( { status: 200, description: 'Logged in successfully' } )
	@ApiResponse( { status: 401, description: 'Invalid credentials' } )
	@HttpCode( HttpStatus.OK )
	login ( @Body() customerLoginDto: ClientLoginDto ) {
		return this.customerAuthService.login( customerLoginDto );
	}

	@Throttle( { default: { ttl: 60_000, limit: 10 } } )
	@Post( 'google' )
	@ApiOperation( {
		summary: 'Customer sign in or register with a Google ID token',
		description:
			'Pass an ID token obtained from the Google Sign-In SDK. If an account with the email already exists it is auto-linked to the Google identity; otherwise a new customer is created.',
	} )
	@ApiBody( { type: GoogleAuthDto } )
	@ApiResponse( { status: 200, description: 'Signed in successfully' } )
	@ApiResponse( { status: 401, description: 'Invalid Google ID token' } )
	@ApiResponse( { status: 403, description: 'Customer is blocked' } )
	@HttpCode( HttpStatus.OK )
	google ( @Body() dto: GoogleAuthDto ) {
		return this.customerAuthService.signInWithGoogle( dto.idToken );
	}

	@UseGuards( ClientJwtRefreshGuard )
	@Post( 'refresh' )
	@ApiBearerAuth()
	@ApiOperation( { summary: 'Refresh customer access and refresh tokens' } )
	@ApiResponse( { status: 200, description: 'Tokens refreshed successfully' } )
	@ApiResponse( { status: 403, description: 'Access denied' } )
	@HttpCode( HttpStatus.OK )
	refresh ( @Req() req: any ) {
		return this.customerAuthService.refreshTokens(
			req.user.clientId,
			req.user.refreshToken,
			req.user.tenantId,
		);
	}

	@UseGuards( ClientJwtAuthGuard )
	@Get( 'memberships' )
	@ApiBearerAuth()
	@ApiOperation( {
		summary: 'List the tenants this customer belongs to (for switching)',
	} )
	@ApiResponse( { status: 200, description: 'Memberships retrieved' } )
	@HttpCode( HttpStatus.OK )
	memberships ( @CurrentClient( 'clientId' ) clientId: string ) {
		return this.customerAuthService.listMemberships( clientId );
	}

	@UseGuards( ClientJwtAuthGuard )
	@Post( 'switch-tenant' )
	@ApiBearerAuth()
	@ApiOperation( {
		summary: 'Switch the active tenant and receive a re-scoped token pair',
	} )
	@ApiBody( { type: SwitchTenantDto } )
	@ApiResponse( { status: 200, description: 'Switched tenant successfully' } )
	@ApiResponse( { status: 403, description: 'Not a member of this tenant' } )
	@HttpCode( HttpStatus.OK )
	switchTenant (
		@CurrentClient( 'clientId' ) clientId: string,
		@Body() switchTenantDto: SwitchTenantDto,
	) {
		return this.customerAuthService.switchTenant(
			clientId,
			switchTenantDto.tenantId,
		);
	}

	@UseGuards( ClientJwtAuthGuard )
	@Post( 'logout' )
	@ApiBearerAuth()
	@ApiOperation( { summary: 'Customer logout' } )
	@ApiResponse( { status: 200, description: 'Logged out successfully' } )
	@HttpCode( HttpStatus.OK )
	logout ( @CurrentClient( 'clientId' ) clientId: string ) {
		return this.customerAuthService.logout( clientId );
	}

	@Throttle( { default: { ttl: 60_000, limit: 5 } } )
	@Post( 'forgot-password' )
	@ApiOperation( { summary: 'Request customer password reset email' } )
	@ApiBody( { type: ForgetPasswordDto } )
	@ApiResponse( { status: 200, description: 'Password reset email sent' } )
	@ApiResponse( { status: 400, description: 'Validation error' } )
	@HttpCode( HttpStatus.OK )
	forgotPassword ( @Body() forgetPasswordDto: ForgetPasswordDto ) {
		return this.customerAuthService.forgetPassword( forgetPasswordDto.email );
	}

	@Throttle( { default: { ttl: 60_000, limit: 10 } } )
	@Post( 'reset-password' )
	@ApiOperation( { summary: 'Reset customer password using token from email' } )
	@ApiBody( { type: ResetPasswordDto } )
	@ApiResponse( { status: 200, description: 'Password reset successfully' } )
	@ApiResponse( { status: 400, description: 'Invalid or expired token' } )
	@HttpCode( HttpStatus.OK )
	resetPassword ( @Body() resetPasswordDto: ResetPasswordDto ) {
		return this.customerAuthService.resetPassword(
			resetPasswordDto.token,
			resetPasswordDto.newPassword,
		);
	}

	@UseGuards( ClientJwtAuthGuard )
	@Get( 'me' )
	@ApiBearerAuth()
	@ApiOperation(
		{ summary: 'Get the currently authenticated customer profile' } )
	@ApiResponse( { status: 200, description: 'Customer profile retrieved' } )
	@HttpCode( HttpStatus.OK )
	getMe ( @CurrentClient( 'clientId' ) clientId: string ) {
		return this.customerAuthService.getMe( clientId );
	}
}
