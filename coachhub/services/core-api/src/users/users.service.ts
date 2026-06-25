import { Injectable }       from '@nestjs/common';
import { UpdateUserDto }    from './dto/update-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User }             from './entities/user.entity';
import { Repository }       from 'typeorm';
import { TenantService }    from '../tenant/tenant.service';
import { RegisterDto }      from './dto/register-user.dto';

@Injectable()
export class UsersService {
	constructor (
		@InjectRepository( User )
		private readonly userRepository: Repository<User>,
		private readonly tenantService: TenantService
	) {}

	async create ( createUserDto: RegisterDto ) {
		const tenantName = `${ createUserDto.name }'s Tenant`;
		const slug = await this.tenantService.generateAvailableSlug( tenantName );

		const user = this.userRepository.create( {
			...createUserDto,
			tenant: { name: tenantName, slug },
		} );
		return this.userRepository.save( user );
	}

	findAll () {
		return this.userRepository.find();
	}

	findOne ( id: number ) {
		return this.userRepository.findOne( { where: { id }, relations: { tenant: true } } );
	}

	findOneByEmail ( email: string ) {
		return this.userRepository.findOne( {
			where: { email },
			select: { id: true, email: true, password: true },
			relations: { tenant: true },
		} );
	}

	findByIdWithRefreshToken ( id: number ) {
		return this.userRepository.findOne( {
			where: { id },
			select: { id: true, email: true, hashedRefreshToken: true },
			relations: { tenant: true },
		} );
	}

	findProfileById ( id: number ) {
		return this.userRepository.findOne( {
			where: { id },
			relations: { tenant: true },
		} );
	}

	async findByValidResetToken ( hashedToken: string ) {
		return this.userRepository
			.createQueryBuilder( 'user' )
			.addSelect( 'user.resetPasswordToken' )
			.addSelect( 'user.resetPasswordExpires' )
			.where( 'user.resetPasswordToken = :token', { token: hashedToken } )
			.andWhere( 'user.resetPasswordExpires > :now', { now: new Date() } )
			.getOne();
	}

	updateRefreshToken ( id: number, hashedRefreshToken: string ) {
		return this.userRepository.update( id, { hashedRefreshToken } );
	}

	setResetPasswordToken ( id: number, token: string, expires: Date ) {
		return this.userRepository.update( id, {
			resetPasswordToken: token,
			resetPasswordExpires: expires,
		} );
	}

	resetUserPassword ( id: number, hashedPassword: string ) {
		return this.userRepository.update( id, {
			password: hashedPassword,
			resetPasswordToken: null,
			resetPasswordExpires: null,
			hashedRefreshToken: null,
		} );
	}

	logout ( id: number ) {
		return this.userRepository.update( id, { hashedRefreshToken: null } );
	}

	update ( id: number, updateUserDto: UpdateUserDto ) {
		return this.userRepository.update( id, updateUserDto );
	}

	remove ( id: number ) {
		return this.userRepository.delete( id );
	}
}
