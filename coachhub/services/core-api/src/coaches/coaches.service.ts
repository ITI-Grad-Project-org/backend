import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Coach } from './entities/coach.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantService } from '../tenant/tenant.service';
import { RegisterCoachDto } from './dto/register-coach.dto';
import { UpdateCoachDto } from './dto/update-coach.dto';

@Injectable()
export class CoachesService {
	constructor(
		@InjectRepository(Coach)
		private readonly coachRepository: Repository<Coach>,
		private readonly tenantService: TenantService,
		private readonly dataSource: DataSource,
	) {}

	async create(registerDto: RegisterCoachDto): Promise<Coach> {
		const slug = await this.tenantService.generateAvailableSlug(
			registerDto.businessName,
		);

		return this.dataSource.transaction(async (manager) => {
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

			await this.seedExerciseLibrary(manager, savedTenant.id);

			savedCoach.tenants = [savedTenant];
			return savedCoach;
		});
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

	private seedExerciseLibrary(manager: EntityManager, tenantId: string) {
		return manager.query(
			`INSERT INTO exercises
			 (tenant_id, source_seed_id, name, category, primary_muscle,
			  secondary_muscles,
			  equipment, demo_video_url, demo_gif_url, thumbnail_url,
			  instruction_steps)
			 SELECT $1,
			        s.id,
			        s.name,
			        s.category,
			        s.primary_muscle,
			        s.secondary_muscles,
			        s.equipment,
			        s.demo_video_url,
			        s.demo_gif_url,
			        s.thumbnail_url,
			        s.instruction_steps
			 FROM default_exercises s
			 WHERE s.is_active`,
			[tenantId],
		);
	}
}
