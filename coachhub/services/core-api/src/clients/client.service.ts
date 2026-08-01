import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { S3UploadService } from '../s3-upload/s3-upload.service';

@Injectable()
export class ClientService {
	constructor(
		@InjectRepository(Client)
		private readonly clientRepository: Repository<Client>,
		private readonly s3UploadService: S3UploadService,
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

	/** Loads the hidden OTP columns — the reset flow needs them explicitly. */
	findOneByEmailWithResetOtp(email: string) {
		return this.clientRepository
			.createQueryBuilder('client')
			.addSelect([
				'client.resetOtpHash',
				'client.resetOtpExpires',
				'client.resetOtpAttempts',
			])
			.where('client.email = :email', { email })
			.getOne();
	}

	/** Issuing a new OTP invalidates any ticket already handed out. */
	setResetOtp(id: string, otpHash: string, expires: Date) {
		return this.clientRepository.update(id, {
			resetOtpHash: otpHash,
			resetOtpExpires: expires,
			resetOtpAttempts: 0,
			resetPasswordToken: null,
			resetPasswordExpires: null,
		});
	}

	incrementResetOtpAttempts(id: string) {
		return this.clientRepository.increment({ id }, 'resetOtpAttempts', 1);
	}

	clearResetOtp(id: string) {
		return this.clientRepository.update(id, {
			resetOtpHash: null,
			resetOtpExpires: null,
			resetOtpAttempts: 0,
		});
	}

	resetClientPassword(id: string, hashedPassword: string) {
		return this.clientRepository.update(id, {
			password: hashedPassword,
			resetOtpHash: null,
			resetOtpExpires: null,
			resetOtpAttempts: 0,
			resetPasswordToken: null,
			resetPasswordExpires: null,
			hashedRefreshToken: null,
		});
	}

	logout(id: string) {
		return this.clientRepository.update(id, { hashedRefreshToken: null });
	}

	/**
	 * Updates the profile, uploading the avatar in the same request when a file
	 * is attached. The new image is uploaded before the row is written so a
	 * failed upload aborts the update; the previous avatar is removed afterwards,
	 * best-effort, to avoid orphaned objects.
	 */
	async update(
		id: string,
		updateClientDto: UpdateClientDto,
		avatar?: Express.Multer.File,
	) {
		let newAvatarUrl: string | undefined;
		let previousAvatarUrl: string | null = null;

		if (avatar) {
			const existing = await this.clientRepository.findOne({
				where: { id },
				select: { id: true, avatarUrl: true },
			});
			previousAvatarUrl = existing?.avatarUrl ?? null;
			newAvatarUrl = (await this.s3UploadService.uploadImage(avatar, 'client'))
				.url;
		}

		await this.clientRepository.update(id, {
			...updateClientDto,
			...(newAvatarUrl ? { avatarUrl: newAvatarUrl } : {}),
		});

		if (newAvatarUrl && previousAvatarUrl) {
			await this.s3UploadService.deleteByUrl(previousAvatarUrl);
		}

		return this.findProfileById(id);
	}

	remove(id: string) {
		return this.clientRepository.softDelete(id);
	}
}
