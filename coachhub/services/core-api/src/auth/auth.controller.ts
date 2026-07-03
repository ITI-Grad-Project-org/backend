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
	AuthService
} from './services/auth.service';
import {
	LoginDto
} from './dto/login.dto';
import {
	ForgetPasswordDto
} from './dto/forget-password.dto';
import {
	ResetPasswordDto
} from './dto/reset-password.dto';
import {
	AuthPayload
} from 'src/common/interfaces/authPayload.interface';
import {
	JwtAuthGuard,
	JwtRefreshGuard
} from './guards';
import {
	CurrentUser,
	Public
} from './decorators';
import {
	RegisterDto
} from '../users/dto/register-user.dto';

@ApiTags( 'Auth' )
@Controller( 'auth' )
export class AuthController {
	constructor ( private readonly authService: AuthService ) {}

	@Public()
	@Throttle( { default: { ttl: 60_000, limit: 10 } } )
	@Post( 'register' )
	// @ApiConsumes( 'multipart/form-data' )
	@ApiOperation( {
		summary: 'Register a new agent (auto-creates a tenant)',
	} )
	@ApiBody( {
		schema: {
			type: 'object',
			required: [
				'name',
				'email',
				'password',
				'confirmPassword',
				'phoneNumber',
				'whatsappNumber',
			],
			properties: {
				name: { type: 'string', example: 'Jane Smith' },
				email: { type: 'string', example: 'jane@acme.com' },
				password: { type: 'string', minLength: 6, example: 'password123' },
				confirmPassword: { type: 'string', example: 'password123' },
				phoneNumber: { type: 'string', example: '+966500000000' },
				whatsappNumber: { type: 'string', example: '+966500000000' },
			},
		},
	} )
	@ApiResponse( {
		status: 201,
		description: 'Tenant and owner registered successfully',
	} )
	@ApiResponse( {
		status: 400,
		description: 'Validation error or email already in use',
	} )
	@HttpCode( HttpStatus.CREATED )
	register (
		@Body() registerDto: RegisterDto,
	) {
		return this.authService.register( registerDto );
	}

	@Public()
	@Throttle( { default: { ttl: 60_000, limit: 10 } } )
	@Post( 'login' )
	@ApiOperation( { summary: 'Login with email and password' } )
	@ApiBody( { type: LoginDto } )
	@ApiResponse( { status: 200, description: 'Logged in successfully' } )
	@ApiResponse( { status: 401, description: 'Invalid credentials' } )
	@ApiResponse( { status: 400, description: 'Validation error' } )
	@HttpCode( HttpStatus.OK )
	login ( @Body() loginDto: LoginDto ) {
		return this.authService.login( loginDto );
	}

	@Public()
	@UseGuards( JwtRefreshGuard )
	@Post( 'refresh' )
	@ApiBearerAuth()
	@ApiOperation( { summary: 'Refresh access and refresh tokens' } )
	@ApiResponse( { status: 200, description: 'Tokens refreshed successfully' } )
	@ApiResponse( { status: 403, description: 'Access denied' } )
	@HttpCode( HttpStatus.OK )
	refresh ( @Req() req: any ) {
		return this.authService.refreshTokens(
			req.user.userId,
			req.user.refreshToken,
		);
	}

	@UseGuards( JwtAuthGuard )
	@Post( 'logout' )
	@ApiBearerAuth()
	@ApiOperation( { summary: 'Logout and invalidate refresh token' } )
	@ApiResponse( { status: 200, description: 'Logged out successfully' } )
	@HttpCode( HttpStatus.OK )
	logout ( @CurrentUser( 'userId' ) userId: number ) {
		return this.authService.logout( userId );
	}

	@Public()
	@Throttle( { default: { ttl: 60_000, limit: 5 } } )
	@Post( 'forgot-password' )
	@ApiOperation( { summary: 'Request password reset email' } )
	@ApiBody( { type: ForgetPasswordDto } )
	@ApiResponse( { status: 200, description: 'Password reset email sent' } )
	@ApiResponse( { status: 400, description: 'Validation error' } )
	@HttpCode( HttpStatus.OK )
	forgotPassword ( @Body() forgetPasswordDto: ForgetPasswordDto ) {
		return this.authService.forgetPassword( forgetPasswordDto.email );
	}

	@Public()
	@Throttle( { default: { ttl: 60_000, limit: 10 } } )
	@Post( 'reset-password' )
	@ApiOperation( { summary: 'Reset password using token from email' } )
	@ApiBody( { type: ResetPasswordDto } )
	@ApiResponse( { status: 200, description: 'Password reset successfully' } )
	@ApiResponse( { status: 400, description: 'Invalid or expired token' } )
	@HttpCode( HttpStatus.OK )
	resetPassword ( @Body() resetPasswordDto: ResetPasswordDto ) {
		return this.authService.resetPassword(
			resetPasswordDto.token,
			resetPasswordDto.newPassword,
		);
	}

	@UseGuards( JwtAuthGuard )
	@Get( 'me' )
	@ApiBearerAuth()
	@ApiOperation( {
		summary:
			'Get current authenticated user profile, including currentTenant and memberships',
	} )
	@ApiResponse(
		{ status: 200, description: 'User info retrieved successfully' } )
	@ApiResponse( { status: 401, description: 'Unauthorized' } )
	getProfile ( @CurrentUser() user: AuthPayload ) {
		return this.authService.getMe( user.userId );
	}

}
