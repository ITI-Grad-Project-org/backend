import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ExercisesService } from '../exercises/exercises.service';
import { Coach, CoachCertification } from './entities/coach.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantService } from '../tenant/tenant.service';
import { RegisterCoachDto } from './dto/register-coach.dto';
import { UpdateCoachDto } from './dto/update-coach.dto';
import { AddCertificationDto } from './dto/add-certification.dto';
import { S3UploadService } from '../s3-upload/s3-upload.service';

/** Files pulled off the multipart profile-update request. */
export interface CoachProfileFiles {
	avatar?: Express.Multer.File;
	transformationPhotos: Express.Multer.File[];
	certificateFiles: Express.Multer.File[];
}

@Injectable()
export class CoachesService {
	private readonly logger = new Logger(CoachesService.name);

	constructor(
		@InjectRepository(Coach)
		private readonly coachRepository: Repository<Coach>,
		private readonly tenantService: TenantService,
		private readonly dataSource: DataSource,
		private readonly exercisesService: ExercisesService,
		private readonly s3UploadService: S3UploadService,
	) {}

	async create(registerDto: RegisterCoachDto): Promise<Coach> {
		const slug = await this.tenantService.generateAvailableSlug(
			registerDto.businessName,
		);

		const savedCoach = await this.dataSource.transaction(async (manager) => {
			const coach = manager.create(Coach, {
				firstName: registerDto.firstName,
				lastName: registerDto.lastName,
				email: registerDto.email,
				password: registerDto.password,
			});
			const savedCoach = await manager.save(coach);

			const tenant = manager.create(Tenant, {
				ownerCoach: savedCoach,
				name: registerDto.businessName,
				slug,
				...(registerDto.timezone ? { timezone: registerDto.timezone } : {}),
				...(registerDto.currency ? { currency: registerDto.currency } : {}),
			});
			const savedTenant = await manager.save(tenant);

			savedCoach.tenants = [savedTenant];
			return savedCoach;
		});

		const tenantId = savedCoach.tenants[0].id;

		try {
			await this.exercisesService.initializeCoachLibrary(tenantId);
		} catch (error) {
			const trace = error instanceof Error ? error.stack : String(error);
			this.logger.error(
				`Exercise library initialization failed for tenant ${tenantId}`,
				trace,
			);
		}

		return savedCoach;
	}

	findAll() {
		return this.coachRepository.find();
	}

	findOne(id: string) {
		return this.coachRepository.findOne({
			where: { id },
			relations: { tenants: true },
		});
	}

	findOneByPhone(phone: string) {
		return this.coachRepository.findOne({
			where: { phone },
			select: { id: true },
		});
	}

	findOneByEmail(email: string) {
		return this.coachRepository.findOne({
			where: { email },
			select: {
				id: true,
				email: true,
				password: true,
				firstName: true,
				lastName: true,
			},
			relations: { tenants: true },
		});
	}

	findByIdWithRefreshToken(id: string) {
		return this.coachRepository.findOne({
			where: { id },
			select: { id: true, email: true, hashedRefreshToken: true },
			relations: { tenants: true },
		});
	}

	findProfileById(id: string) {
		return this.coachRepository.findOne({
			where: { id },
			relations: { tenants: true },
		});
	}

	async findByValidResetToken(hashedToken: string) {
		return this.coachRepository
			.createQueryBuilder('coach')
			.addSelect('coach.resetPasswordToken')
			.addSelect('coach.resetPasswordExpires')
			.where('coach.resetPasswordToken = :token', { token: hashedToken })
			.andWhere('coach.resetPasswordExpires > :now', { now: new Date() })
			.getOne();
	}

	updateRefreshToken(id: string, hashedRefreshToken: string | null) {
		return this.coachRepository.update(id, { hashedRefreshToken });
	}

	setResetPasswordToken(id: string, token: string, expires: Date) {
		return this.coachRepository.update(id, {
			resetPasswordToken: token,
			resetPasswordExpires: expires,
		});
	}

	/** Loads the hidden OTP columns — the reset flow needs them explicitly. */
	findOneByEmailWithResetOtp(email: string) {
		return this.coachRepository
			.createQueryBuilder('coach')
			.addSelect([
				'coach.resetOtpHash',
				'coach.resetOtpExpires',
				'coach.resetOtpAttempts',
			])
			.leftJoinAndSelect('coach.tenants', 'tenant')
			.where('coach.email = :email', { email })
			.getOne();
	}

	/** Issuing a new OTP invalidates any ticket already handed out. */
	setResetOtp(id: string, otpHash: string, expires: Date) {
		return this.coachRepository.update(id, {
			resetOtpHash: otpHash,
			resetOtpExpires: expires,
			resetOtpAttempts: 0,
			resetPasswordToken: null,
			resetPasswordExpires: null,
		});
	}

	incrementResetOtpAttempts(id: string) {
		return this.coachRepository.increment({ id }, 'resetOtpAttempts', 1);
	}

	clearResetOtp(id: string) {
		return this.coachRepository.update(id, {
			resetOtpHash: null,
			resetOtpExpires: null,
			resetOtpAttempts: 0,
		});
	}

	resetCoachPassword(id: string, hashedPassword: string) {
		return this.coachRepository.update(id, {
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
		return this.coachRepository.update(id, { hashedRefreshToken: null });
	}

	/**
	 * Updates the profile and uploads any attached media in the same request.
	 * Uploads run before the row is written; if the DB write fails, freshly
	 * uploaded objects are removed so nothing is orphaned. Replaced avatar and
	 * transformation photos are deleted best-effort after a successful write.
	 *
	 * Phone is set here (not at sign-up), so its uniqueness check lives here too
	 * — the column is unique and would otherwise surface as a raw driver error.
	 */
	async update(
		id: string,
		updateCoachDto: UpdateCoachDto,
		files: CoachProfileFiles = {
			transformationPhotos: [],
			certificateFiles: [],
		},
	) {
		if (updateCoachDto.phone) {
			const existingPhone = await this.findOneByPhone(updateCoachDto.phone);
			if (existingPhone && existingPhone.id !== id) {
				throw new ConflictException('Phone number is already in use');
			}
		}

		const { certifications, ...profile } = updateCoachDto;
		this.assertCertificateFilesMatch(certifications, files.certificateFiles);

		// URLs uploaded in this request, so we can roll them back on a later error.
		const uploadedUrls: string[] = [];
		try {
			const patch: Record<string, unknown> = { ...profile };
			let replacedAvatar: string | null = null;
			let replacedPhotos: string[] = [];

			if (files.avatar) {
				replacedAvatar = await this.currentAvatarUrl(id);
				const { url } = await this.s3UploadService.uploadImage(
					files.avatar,
					'coach',
				);
				uploadedUrls.push(url);
				patch.avatarUrl = url;
			}

			if (files.transformationPhotos.length > 0) {
				replacedPhotos = await this.currentTransformationPhotos(id);
				const results = await this.s3UploadService.uploadImages(
					files.transformationPhotos,
					'coach',
				);
				const urls = results.map((r) => r.url);
				uploadedUrls.push(...urls);
				patch.transformationPhotos = urls;
			}

			if (certifications) {
				patch.certifications = await this.attachCertificateFiles(
					certifications,
					files.certificateFiles,
					uploadedUrls,
				);
			}

			await this.coachRepository.update(id, patch);

			// Row saved — safe to drop what the new media replaced.
			if (patch.avatarUrl && replacedAvatar) {
				await this.s3UploadService.deleteByUrl(replacedAvatar);
			}
			if (patch.transformationPhotos) {
				await Promise.all(
					replacedPhotos.map((url) => this.s3UploadService.deleteByUrl(url)),
				);
			}

			return this.findProfileById(id);
		} catch (error) {
			await Promise.all(
				uploadedUrls.map((url) => this.s3UploadService.deleteByUrl(url)),
			);
			throw error;
		}
	}

	private assertCertificateFilesMatch(
		certifications: CoachCertification[] | undefined,
		certificateFiles: Express.Multer.File[],
	) {
		if (certificateFiles.length === 0) return;
		if (!certifications || certifications.length === 0) {
			throw new BadRequestException(
				'Certificate files must be accompanied by a `certifications` array ' +
					'in the `data` field — one entry per file, in the same order ' +
					'(e.g. data = {"certifications":[{"name":"NASM CPT"}]}).',
			);
		}
		if (certificateFiles.length > certifications.length) {
			throw new BadRequestException(
				`Received ${certificateFiles.length} certificate files but only ` +
					`${certifications.length} certification entries in \`data\` — ` +
					'each file needs a matching entry, in order.',
			);
		}
	}

	/**
	 * Attaches uploaded PDFs to certification entries by position — the i-th
	 * file fills the i-th entry's `fileUrl`. Entries without a matching file keep
	 * any `fileUrl` already supplied (e.g. a previously uploaded certificate kept
	 * during an edit).
	 */
	private async attachCertificateFiles(
		certifications: CoachCertification[],
		certificateFiles: Express.Multer.File[],
		uploadedUrls: string[],
	): Promise<CoachCertification[]> {
		const results = await this.s3UploadService.uploadDocuments(
			certificateFiles,
			'certificate',
		);
		uploadedUrls.push(...results.map((r) => r.url));

		return certifications.map((cert, index) => {
			const uploaded = results[index];
			return uploaded ? { ...cert, fileUrl: uploaded.url } : cert;
		});
	}

	private async currentAvatarUrl(id: string): Promise<string | null> {
		const coach = await this.coachRepository.findOne({
			where: { id },
			select: { id: true, avatarUrl: true },
		});
		return coach?.avatarUrl ?? null;
	}

	private async currentTransformationPhotos(id: string): Promise<string[]> {
		const coach = await this.coachRepository.findOne({
			where: { id },
			select: { id: true, transformationPhotos: true },
		});
		return coach?.transformationPhotos ?? [];
	}

	// ── Granular media management (separate from the bulk PATCH /coaches/me) ───

	/** Sets or replaces the avatar; the previous image is removed afterwards. */
	async setAvatar(id: string, avatar: Express.Multer.File) {
		if (!avatar) {
			throw new BadRequestException('No avatar file provided');
		}
		const previous = await this.currentAvatarUrl(id);
		const { url } = await this.s3UploadService.uploadImage(avatar, 'coach');

		try {
			await this.coachRepository.update(id, { avatarUrl: url });
		} catch (error) {
			await this.s3UploadService.deleteByUrl(url);
			throw error;
		}

		if (previous) await this.s3UploadService.deleteByUrl(previous);
		return this.findProfileById(id);
	}

	async removeAvatar(id: string) {
		const previous = await this.currentAvatarUrl(id);
		await this.coachRepository.update(id, { avatarUrl: null });
		if (previous) await this.s3UploadService.deleteByUrl(previous);
		return this.findProfileById(id);
	}

	/** Appends to the gallery — existing photos are kept. */
	async addTransformationPhotos(id: string, files: Express.Multer.File[]) {
		if (!files || files.length === 0) {
			throw new BadRequestException('No photos provided');
		}
		const existing = await this.currentTransformationPhotos(id);
		const results = await this.s3UploadService.uploadImages(files, 'coach');
		const urls = results.map((r) => r.url);

		try {
			await this.coachRepository.update(id, {
				transformationPhotos: [...existing, ...urls],
			});
		} catch (error) {
			await Promise.all(
				urls.map((url) => this.s3UploadService.deleteByUrl(url)),
			);
			throw error;
		}

		return this.findProfileById(id);
	}

	async removeTransformationPhoto(id: string, url: string) {
		const existing = await this.currentTransformationPhotos(id);
		if (!existing.includes(url)) {
			throw new NotFoundException('Photo not found on this profile');
		}

		await this.coachRepository.update(id, {
			transformationPhotos: existing.filter((u) => u !== url),
		});
		await this.s3UploadService.deleteByUrl(url);
		return this.findProfileById(id);
	}

	/** Adds one certificate (metadata + file) with a generated id. */
	async addCertification(
		id: string,
		dto: AddCertificationDto,
		file: Express.Multer.File,
	) {
		if (!file) {
			throw new BadRequestException('A certificate file is required');
		}
		const certifications = await this.currentCertifications(id);
		const { url } = await this.s3UploadService.uploadDocument(
			file,
			'certificate',
		);
		const certification: CoachCertification = {
			id: randomUUID(),
			...dto,
			fileUrl: url,
		};

		try {
			await this.coachRepository.update(id, {
				certifications: [...certifications, certification],
			});
		} catch (error) {
			await this.s3UploadService.deleteByUrl(url);
			throw error;
		}

		return this.findProfileById(id);
	}

	async removeCertification(id: string, certificationId: string) {
		const certifications = await this.currentCertifications(id);
		const target = certifications.find((c) => c.id === certificationId);
		if (!target) {
			throw new NotFoundException('Certification not found');
		}

		await this.coachRepository.update(id, {
			certifications: certifications.filter((c) => c.id !== certificationId),
		});
		if (target.fileUrl) await this.s3UploadService.deleteByUrl(target.fileUrl);
		return this.findProfileById(id);
	}

	private async currentCertifications(
		id: string,
	): Promise<CoachCertification[]> {
		const coach = await this.coachRepository.findOne({
			where: { id },
			select: { id: true, certifications: true },
		});
		if (!coach) {
			throw new NotFoundException('Coach not found');
		}
		return coach.certifications ?? [];
	}

	remove(id: string) {
		return this.coachRepository.softDelete(id);
	}
}
