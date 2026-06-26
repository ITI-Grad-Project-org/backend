import {
	Body,
	Controller,
	Delete,
	ForbiddenException,
	Get,
	Param,
	ParseIntPipe,
	Patch,
}                        from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService }  from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser }   from '../auth';

/**
 * Self-service profile management for the authenticated coach (tenant owner).
 *
 * Account creation goes through `POST /auth/register` (it also provisions the
 * tenant), so there is no create/list here — a coach may only read and mutate
 * their own record. The global `JwtAuthGuard` enforces authentication.
 */
@ApiTags( 'Users' )
@ApiBearerAuth()
@Controller( 'users' )
export class UsersController {
	constructor ( private readonly usersService: UsersService ) {}

	@Get( 'me' )
	@ApiOperation( { summary: 'Get my profile' } )
	getMe ( @CurrentUser( 'userId' ) userId: number ) {
		return this.usersService.findOne( userId );
	}

	@Get( ':id' )
	@ApiOperation( { summary: 'Get a user by id (must be yourself)' } )
	findOne (
		@CurrentUser( 'userId' ) userId: number,
		@Param( 'id', ParseIntPipe ) id: number,
	) {
		this.assertSelf( userId, id );
		return this.usersService.findOne( id );
	}

	@Patch( ':id' )
	@ApiOperation( { summary: 'Update my profile' } )
	update (
		@CurrentUser( 'userId' ) userId: number,
		@Param( 'id', ParseIntPipe ) id: number,
		@Body() updateUserDto: UpdateUserDto,
	) {
		this.assertSelf( userId, id );
		return this.usersService.update( id, updateUserDto );
	}

	@Delete( ':id' )
	@ApiOperation( { summary: 'Delete my account' } )
	remove (
		@CurrentUser( 'userId' ) userId: number,
		@Param( 'id', ParseIntPipe ) id: number,
	) {
		this.assertSelf( userId, id );
		return this.usersService.remove( id );
	}

	private assertSelf ( userId: number, targetId: number ) {
		if ( Number( userId ) !== targetId ) {
			throw new ForbiddenException( 'You can only access your own account' );
		}
	}
}
