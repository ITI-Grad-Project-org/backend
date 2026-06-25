import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
	Patch,
	Post
}                        from '@nestjs/common';
import { UsersService }  from './users.service';
import { RegisterDto }   from './dto/register-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiResponse }   from '../common';
import { User }          from './entities/user.entity';

@Controller( 'users' )
export class UsersController {
	constructor ( private readonly usersService: UsersService ) {}

	@Post()
	async create ( @Body() createUserDto: RegisterDto ): Promise<ApiResponse<User>> {
		const user = await this.usersService.create( createUserDto );
		return {
			success: true,
			message: 'User created successfully',
			data: user,
		};
	}

	@Get()
	findAll () {
		return this.usersService.findAll();
	}

	@Get( ':id' )
	findOne ( @Param( 'id', ParseIntPipe ) id: string ) {
		return this.usersService.findOne( +id );
	}

	@Patch( ':id' )
	update ( @Param( 'id',
		ParseIntPipe ) id: string, @Body() updateUserDto: UpdateUserDto ) {
		return this.usersService.update( +id, updateUserDto );
	}

	@Delete( ':id' )
	remove ( @Param( 'id', ParseIntPipe ) id: string ) {
		return this.usersService.remove( +id );
	}
}
