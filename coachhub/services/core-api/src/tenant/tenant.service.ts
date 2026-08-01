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
import { S3UploadService } from '../s3-upload/s3-upload.service';

@Injectable()
export class TenantService {
	constructor(
		@InjectRepository(Tenant)
		private readonly tenantRepository: Repository<Tenant>,
		private readonly s3UploadService: S3UploadService,
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

	/** Uploads a new brand logo and swaps it in, removing the old one. */
	async updateLogo(id: string, logo: Express.Multer.File): Promise<Tenant> {
		const tenant = await this.findOne(id);
		const previousLogoUrl = tenant.logoUrl;

		const { url } = await this.s3UploadService.uploadImage(logo, 'tenant');
		tenant.logoUrl = url;
		const saved = await this.tenantRepository.save(tenant);

		if (previousLogoUrl) {
			await this.s3UploadService.deleteByUrl(previousLogoUrl);
		}
		return saved;
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
