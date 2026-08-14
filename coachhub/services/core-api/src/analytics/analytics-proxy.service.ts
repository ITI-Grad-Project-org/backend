import {
	BadGatewayException,
	GatewayTimeoutException,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsConfig } from '../config';

@Injectable()
export class AnalyticsProxyService {
	private readonly logger = new Logger(AnalyticsProxyService.name);
	private readonly config: AnalyticsConfig;

	constructor(private readonly configService: ConfigService) {
		this.config = this.configService.getOrThrow<AnalyticsConfig>('analytics');
	}

	async get<T>(
		path: string,
		tenantId: string,
		query: Record<string, string | undefined> = {},
	): Promise<T> {
		if (!tenantId) {
			throw new InternalServerErrorException(
				'No tenant on the authenticated principal',
			);
		}

		const url = new URL(
			`${this.config.baseUrl}/api/analytics/tenants/${encodeURIComponent(
				tenantId,
			)}/${path}`,
		);
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined && value !== null && value !== '') {
				url.searchParams.set(key, value);
			}
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

		try {
			const response = await fetch(url, {
				signal: controller.signal,
				headers: { accept: 'application/json' },
			});

			if (response.ok) {
				return (await response.json()) as T;
			}

			if (response.status === 404) {
				throw new NotFoundException('Analytics resource not found');
			}

			const body = await response.text().catch(() => '');
			this.logger.error(
				`analytics-service ${response.status} for ${path}: ${body.slice(
					0,
					300,
				)}`,
			);
			throw new BadGatewayException('Analytics service returned an error');
		} catch (error) {
			if (
				error instanceof NotFoundException ||
				error instanceof BadGatewayException
			) {
				throw error;
			}
			if (error instanceof Error && error.name === 'AbortError') {
				this.logger.error(
					`analytics-service timed out after ${this.config.timeoutMs}ms`,
				);
				throw new GatewayTimeoutException('Analytics service timed out');
			}
			this.logger.error(`analytics-service unreachable: ${String(error)}`);
			throw new BadGatewayException('Analytics service is unavailable');
		} finally {
			clearTimeout(timer);
		}
	}
}
