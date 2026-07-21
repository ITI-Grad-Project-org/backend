import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ExercisesService } from '../exercises/exercises.service';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantService } from '../tenant/tenant.service';
import { RegisterCoachDto } from './dto/register-coach.dto';
import { UpdateCoachDto } from './dto/update-coach.dto';
import { Coach } from './entities/coach.entity';

@Injectable()
export class CoachesService {
	private readonly logger = new Logger(CoachesService.name);

	constructor(
		@InjectRepository(Coach)
		private readonly coachRepository: Repository<Coach>,
		private readonly tenantService: TenantService,
		private readonly dataSource: DataSource,
		private readonly exercisesService: ExercisesService,
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
				phone: registerDto.phone ?? null,
				password: registerDto.password,
				bio: registerDto.bio ?? null,
				specialties: registerDto.specialties ?? [],
				yearsExperience: registerDto.yearsExperience ?? null,
				certifications: registerDto.certifications ?? [],
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

	resetCoachPassword(id: string, hashedPassword: string) {
		return this.coachRepository.update(id, {
			password: hashedPassword,
			resetPasswordToken: null,
			resetPasswordExpires: null,
			hashedRefreshToken: null,
		});
	}

	logout(id: string) {
		return this.coachRepository.update(id, { hashedRefreshToken: null });
	}

	update(id: string, updateCoachDto: UpdateCoachDto) {
		return this.coachRepository.update(id, updateCoachDto);
	}

	remove(id: string) {
		return this.coachRepository.softDelete(id);
	}
}
