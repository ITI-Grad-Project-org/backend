import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { MembershipStatus, PaginatedResponse } from '../common';
import { CreateMeasurementDto } from './dto/create-measurement.dto';
import { QueryMeasurementsDto } from './dto/query-measurements.dto';
import { UpdateMeasurementDto } from './dto/update-measurement.dto';
import { Measurement } from './entities/measurement.entity';
import { S3UploadService } from '../s3-upload/s3-upload.service';

@Injectable()
export class MeasurementsService {
	constructor(
		@InjectRepository(Measurement)
		private readonly measurementRepository: Repository<Measurement>,
		@InjectRepository(ClientMembership)
		private readonly membershipRepository: Repository<ClientMembership>,
		private readonly s3UploadService: S3UploadService,
	) {}

	private async uploadPhotos(photos: Express.Multer.File[]): Promise<string[]> {
		if (photos.length === 0) return [];
		const results = await this.s3UploadService.uploadImages(photos, 'client');
		return results.map((r) => r.url);
	}

	async createClientMeasurement(
		clientId: string,
		tenantId: string | null,
		dto: CreateMeasurementDto,
		photos: Express.Multer.File[] = [],
	) {
		const membership = await this.resolveActiveMembership(clientId, tenantId);
		const measuredAt = dto.measuredAt ?? new Date().toISOString().slice(0, 10);
		const existingMeasurement = await this.measurementRepository.findOne({
			where: {
				membershipId: membership.id,
				measuredAt,
			},
		});

		if (existingMeasurement) {
			throw new ConflictException('Measurement already exists for this date');
		}

		const photoUrls = await this.uploadPhotos(photos);

		const measurement = this.measurementRepository.create({
			...dto,
			...(photoUrls.length > 0 ? { photos: photoUrls } : {}),
			measuredAt,
			membershipId: membership.id,
			membership: { id: membership.id },
			tenantId: membership.tenant.id,
			tenant: { id: membership.tenant.id },
		});

		try {
			return await this.measurementRepository.save(measurement);
		} catch (error) {
			// Don't leak the just-uploaded objects if the row can't be written.
			await Promise.all(
				photoUrls.map((url) => this.s3UploadService.deleteByUrl(url)),
			);
			this.throwConflictForUniqueViolation(
				error,
				'Measurement already exists for this date',
			);
			throw error;
		}
	}

	async findClientMeasurements(
		clientId: string,
		tenantId: string | null,
		query: QueryMeasurementsDto,
	): Promise<PaginatedResponse<Measurement>> {
		const membership = await this.resolveActiveMembership(clientId, tenantId);
		return this.findMeasurementsForMembership(membership.id, query, 'DESC');
	}

	async findClientMeasurementsForCoach(
		tenantId: string,
		clientId: string,
		query: QueryMeasurementsDto,
	): Promise<PaginatedResponse<Measurement>> {
		const membership = await this.resolveTenantMembership(tenantId, clientId);
		return this.findMeasurementsForMembership(membership.id, query, 'ASC');
	}

	async findSingleMeasurementForCoach(
		tenantId: string,
		clientId: string,
		measurementId: string,
	) {
		const membership = await this.resolveTenantMembership(tenantId, clientId);
		return this.getOwnedMeasurementOrThrow(membership.id, measurementId);
	}

	private async findMeasurementsForMembership(
		membershipId: string,
		query: QueryMeasurementsDto,
		order: 'ASC' | 'DESC',
	): Promise<PaginatedResponse<Measurement>> {
		if (query.from && query.to && query.from > query.to) {
			throw new BadRequestException('from must be on or before to');
		}

		const page = query.page ?? 1;
		const limit = query.limit ?? 10;
		const queryBuilder = this.measurementRepository
			.createQueryBuilder('measurement')
			.where('measurement.membership_id = :membershipId', {
				membershipId,
			});

		if (query.from) {
			queryBuilder.andWhere('measurement.measured_at >= :from', {
				from: query.from,
			});
		}

		if (query.to) {
			queryBuilder.andWhere('measurement.measured_at <= :to', {
				to: query.to,
			});
		}

		const [docs, total] = await queryBuilder
			.orderBy('measurement.measured_at', order)
			.addOrderBy('measurement.id', order)
			.skip((page - 1) * limit)
			.take(limit)
			.getManyAndCount();

		return {
			docs,
			meta: {
				total,
				page,
				limit,
				totalPages: Math.ceil(total / limit),
			},
		};
	}

	async findSingleMeasurement(
		clientId: string,
		tenantId: string | null,
		measurementId: string,
	) {
		const membership = await this.resolveActiveMembership(clientId, tenantId);
		return this.getOwnedMeasurementOrThrow(membership.id, measurementId);
	}

	async updateClientMeasurement(
		clientId: string,
		tenantId: string | null,
		measurementId: string,
		dto: UpdateMeasurementDto,
		photos: Express.Multer.File[] = [],
	) {
		const membership = await this.resolveActiveMembership(clientId, tenantId);
		const measurement = await this.getOwnedMeasurementOrThrow(
			membership.id,
			measurementId,
		);

		const replacedPhotos = photos.length > 0 ? (measurement.photos ?? []) : [];
		const photoUrls = await this.uploadPhotos(photos);

		Object.assign(measurement, dto);
		if (photoUrls.length > 0) {
			measurement.photos = photoUrls;
		}

		try {
			const saved = await this.measurementRepository.save(measurement);
			await Promise.all(
				replacedPhotos.map((url) => this.s3UploadService.deleteByUrl(url)),
			);
			return saved;
		} catch (error) {
			await Promise.all(
				photoUrls.map((url) => this.s3UploadService.deleteByUrl(url)),
			);
			this.throwConflictForUniqueViolation(
				error,
				'Measurement already exists for this date',
			);
			throw error;
		}
	}

	async deleteClientMeasurement(
		clientId: string,
		tenantId: string | null,
		measurementId: string,
	) {
		const membership = await this.resolveActiveMembership(clientId, tenantId);
		const measurement = await this.getOwnedMeasurementOrThrow(
			membership.id,
			measurementId,
		);

		await this.measurementRepository.delete(measurement.id);
		return { message: 'Measurement deleted' };
	}

	private assertActiveTenant(tenantId: string | null) {
		if (!tenantId) {
			throw new BadRequestException('No active tenant selected');
		}

		return tenantId;
	}

	private async resolveActiveMembership(
		clientId: string,
		tenantId: string | null,
	) {
		const activeTenantId = this.assertActiveTenant(tenantId);
		const membership = await this.membershipRepository.findOne({
			where: {
				client: { id: clientId },
				tenant: { id: activeTenantId },
				status: MembershipStatus.ACTIVE,
			},
			relations: { tenant: true, client: true },
		});

		if (!membership) {
			throw new NotFoundException('Active client membership not found');
		}

		return membership;
	}

	private async resolveTenantMembership(tenantId: string, clientId: string) {
		const membership = await this.membershipRepository.findOne({
			where: {
				client: { id: clientId },
				tenant: { id: tenantId },
			},
		});

		if (!membership) {
			throw new NotFoundException('Client not found in this tenant');
		}

		return membership;
	}

	private async getOwnedMeasurementOrThrow(
		membershipId: string,
		measurementId: string,
	) {
		const measurement = await this.measurementRepository.findOne({
			where: {
				id: measurementId,
				membershipId,
			},
		});

		if (!measurement) {
			throw new NotFoundException('Measurement not found');
		}

		return measurement;
	}

	private getTodayDateString() {
		return new Date().toISOString().slice(0, 10);
	}

	private throwConflictForUniqueViolation(error: unknown, message: string) {
		if (
			error instanceof QueryFailedError &&
			(error.driverError as { code?: string } | undefined)?.code === '23505'
		) {
			throw new ConflictException(message);
		}
	}
}
