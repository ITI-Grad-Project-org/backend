import { Injectable }       from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import { Client }           from './entities/client.entity';
import { CreateClientDto }  from './dto/create-client.dto';
import { UpdateClientDto }  from './dto/update-client.dto';
import { Tenant }           from '../tenant/entities/tenant.entity';

@Injectable()
export class ClientService {
	constructor (
		@InjectRepository( Client )
		private readonly clientRepository: Repository<Client>,
	) {}

	async create ( createClientDto: CreateClientDto ): Promise<Client> {
		const { tenantId, ...rest } = createClientDto;
		const client = this.clientRepository.create( {
			...rest,
			tenant: tenantId ? ( { id: tenantId } as Tenant ) : null,
		} );
		return this.clientRepository.save( client );
	}

	findAll () {
		return this.clientRepository.find( { relations: { tenant: true } } );
	}

	findOne ( id: number ) {
		return this.clientRepository.findOne( { where: { id }, relations: { tenant: true } } );
	}

	findOneByEmail ( email: string ) {
		return this.clientRepository.findOne( {
			where: { email },
			select: {
				id: true,
				email: true,
				password: true,
				status: true,
				blockReason: true,
				googleId: true,
				profilePicture: true,
			},
			relations: { tenant: true },
		} );
	}

	findByGoogleId ( googleId: string ) {
		return this.clientRepository.findOne( {
			where: { googleId },
			select: {
				id: true,
				email: true,
				name: true,
				status: true,
				blockReason: true,
				googleId: true,
				profilePicture: true,
			},
			relations: { tenant: true },
		} );
	}

	findByIdWithRefreshToken ( id: number ) {
		return this.clientRepository.findOne( {
			where: { id },
			select: {
				id: true,
				email: true,
				hashedRefreshToken: true,
				status: true,
			},
			relations: { tenant: true },
		} );
	}

	findProfileById ( id: number ) {
		return this.clientRepository.findOne( {
			where: { id },
			relations: { tenant: true },
		} );
	}

	async findByValidResetToken ( hashedToken: string ) {
		return this.clientRepository
			.createQueryBuilder( 'client' )
			.addSelect( 'client.resetPasswordToken' )
			.addSelect( 'client.resetPasswordExpires' )
			.where( 'client.resetPasswordToken = :token', { token: hashedToken } )
			.andWhere( 'client.resetPasswordExpires > :now', { now: new Date() } )
			.getOne();
	}

	updateRefreshToken ( id: number, hashedRefreshToken: string | null ) {
		return this.clientRepository.update( id, { hashedRefreshToken } );
	}

	updateLastLoginAt ( id: number ) {
		return this.clientRepository.update( id, { lastLoginAt: new Date() } );
	}

	updateGoogleInfo ( id: number, data: { googleId: string; profilePicture?: string } ) {
		return this.clientRepository.update( id, data );
	}

	setResetPasswordToken ( id: number, token: string, expires: Date ) {
		return this.clientRepository.update( id, {
			resetPasswordToken: token,
			resetPasswordExpires: expires,
		} );
	}

	resetClientPassword ( id: number, hashedPassword: string ) {
		return this.clientRepository.update( id, {
			password: hashedPassword,
			resetPasswordToken: null,
			resetPasswordExpires: null,
			hashedRefreshToken: null,
		} );
	}

	logout ( id: number ) {
		return this.clientRepository.update( id, { hashedRefreshToken: null } );
	}

	update ( id: number, updateClientDto: UpdateClientDto ) {
		return this.clientRepository.update( id, updateClientDto );
	}

	remove ( id: number ) {
		return this.clientRepository.softDelete( id );
	}
}
