import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';

export type PlanBuilderType = 'training' | 'nutrition';

const PLAN_BUILDER_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class PlanBuilderCacheService {
	private readonly logger = new Logger(PlanBuilderCacheService.name);

	constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

	async getBuilder<T>(
		planType: PlanBuilderType,
		tenantId: string,
		planId: string,
	): Promise<T | null> {
		try {
			const cached = await this.cache.get<T>(
				this.buildKey(planType, tenantId, planId),
			);
			if (cached == null) {
				this.logger.debug(`${planType} plan builder cache miss`);
				return null;
			}

			this.logger.debug(`${planType} plan builder cache hit`);
			return cached;
		} catch {
			this.logger.warn(`${planType} plan builder cache read failed`);
			return null;
		}
	}

	async setBuilder(
		planType: PlanBuilderType,
		tenantId: string,
		planId: string,
		response: unknown,
	): Promise<void> {
		try {
			await this.cache.set(
				this.buildKey(planType, tenantId, planId),
				response,
				PLAN_BUILDER_CACHE_TTL_MS,
			);
		} catch {
			this.logger.warn(`${planType} plan builder cache write failed`);
		}
	}

	async invalidateBuilder(
		planType: PlanBuilderType,
		tenantId: string,
		planId: string,
	): Promise<void> {
		try {
			await this.cache.del(this.buildKey(planType, tenantId, planId));
		} catch {
			this.logger.warn(`${planType} plan builder cache invalidation failed`);
		}
	}

	private buildKey(
		planType: PlanBuilderType,
		tenantId: string,
		planId: string,
	) {
		return `plans:v1:${planType}:${tenantId}:${planId}`;
	}
}
