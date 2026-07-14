import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientService {
	constructor(
		@InjectRepository(Client)
		private readonly clientRepository: Repository<Client>,
	) {}

	async create(createClientDto: CreateClientDto): Promise<Client> {
		const client = this.clientRepository.create(createClientDto);
		return this.clientRepository.save(client);
	}

	findAll() {
		return this.clientRepository.find();
	}

	findOne(id: string) {
		return this.clientRepository.findOne({
			where: { id },
			relations: { memberships: { tenant: true } },
		});
	}

	findOneByPhone(phone: string) {
		return this.clientRepository.findOne({
			where: { phone },
			select: { id: true },
		});
	}

	findOneByEmail(email: string) {
		return this.clientRepository.findOne({
			where: { email },
			select: {
				id: true,
				email: true,
				password: true,
				googleId: true,
				avatarUrl: true,
			},
		});
	}

	findByGoogleId(googleId: string) {
		return this.clientRepository.findOne({
			where: { googleId },
			select: {
				id: true,
				email: true,
				firstName: true,
				lastName: true,
				googleId: true,
				avatarUrl: true,
			},
		});
	}

	findById(id: string) {
		return this.clientRepository.findOne({ where: { id } });
	}

	findByIdWithRefreshToken(id: string) {
		return this.clientRepository.findOne({
			where: { id },
			select: {
				id: true,
				email: true,
				hashedRefreshToken: true,
			},
		});
	}

	findProfileById(id: string) {
		return this.clientRepository.findOne({
			where: { id },
			relations: { memberships: { tenant: true } },
		});
	}

	async findByValidResetToken(hashedToken: string) {
		return this.clientRepository
			.createQueryBuilder('client')
			.addSelect('client.resetPasswordToken')
			.addSelect('client.resetPasswordExpires')
			.where('client.resetPasswordToken = :token', { token: hashedToken })
			.andWhere('client.resetPasswordExpires > :now', { now: new Date() })
			.getOne();
	}

	updateRefreshToken(id: string, hashedRefreshToken: string | null) {
		return this.clientRepository.update(id, { hashedRefreshToken });
	}

	updateLastLoginAt(id: string) {
		return this.clientRepository.update(id, { lastLoginAt: new Date() });
	}

	updateGoogleInfo(
		id: string,
		data: {
			googleId: string;
			avatarUrl?: string;
		},
	) {
		return this.clientRepository.update(id, data);
	}

	setResetPasswordToken(id: string, token: string, expires: Date) {
		return this.clientRepository.update(id, {
			resetPasswordToken: token,
			resetPasswordExpires: expires,
		});
	}

	resetClientPassword(id: string, hashedPassword: string) {
		return this.clientRepository.update(id, {
			password: hashedPassword,
			resetPasswordToken: null,
			resetPasswordExpires: null,
			hashedRefreshToken: null,
		});
	}

	logout(id: string) {
		return this.clientRepository.update(id, { hashedRefreshToken: null });
	}

	update(id: string, updateClientDto: UpdateClientDto) {
		return this.clientRepository.update(id, updateClientDto);
	}

	remove(id: string) {
		return this.clientRepository.softDelete(id);
	}
}
