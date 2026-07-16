import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';

import { CreateTenantDto } from './dto/create-tenant.dto';
import { Tenant } from './entities/tenant.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { generateUniqueSlug } from '../common';

@Injectable()
export class TenantService {
	constructor(
		@InjectRepository(Tenant)
		private readonly tenantRepository: Repository<Tenant>,
	) {}

	async create(createTenantDto: CreateTenantDto): Promise<Tenant> {
		const existing = await this.tenantRepository.findOneBy({
			slug: createTenantDto.slug,
		});
		if (existing) {
			throw new BadRequestException('Tenant with this slug already exists');
		}
		return this.tenantRepository.create(createTenantDto);
	}

	async findOne(id: string): Promise<Tenant> {
		const tenant = await this.tenantRepository.findOneBy({ id: id });
		if (!tenant) {
			throw new NotFoundException(`Tenant with id ${id} not found`);
		}
		return tenant;
	}

	async findBySlug(slug: string): Promise<Tenant> {
		const tenant = await this.tenantRepository.findOneBy({ slug });
		if (!tenant) {
			throw new NotFoundException(`Tenant with slug ${slug} not found`);
		}
		return tenant;
	}

	async generateAvailableSlug(base: string): Promise<string> {
		return generateUniqueSlug(base, async (slug) => {
			const existing = await this.tenantRepository.findOneBy({ slug });
			return Boolean(existing);
		});
	}
}
