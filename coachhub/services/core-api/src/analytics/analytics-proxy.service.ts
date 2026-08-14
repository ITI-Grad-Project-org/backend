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

/**
 * Read-through proxy to analytics-service.
 *
 * analytics-service is ClusterIP-only and performs no authorisation of its own:
 * it trusts the tenant in the path. core-api is therefore the security boundary,
 * and the one rule that matters is that the tenant id comes from the caller's
 * JWT (via `@CurrentTenant()`) and never from anything the client can set. A
 * tenant id accepted from the request body or query would make every coach's
 * revenue and client list readable by any authenticated user.
 *
 * This is a deliberate exception to the "no service calls another over HTTP"
 * decision in docs/deployment/01-system-architecture.md. That rule exists so
 * domain writes cannot fan out into synchronous chains; a read-only report
 * fetched on behalf of an authenticated coach has no such coupling. Recorded
 * there rather than left as an undocumented contradiction.
 */
@Injectable()
export class AnalyticsProxyService {
	private readonly logger = new Logger(AnalyticsProxyService.name);
	private readonly config: AnalyticsConfig;

	constructor(private readonly configService: ConfigService) {
		this.config = this.configService.getOrThrow<AnalyticsConfig>('analytics');
	}

	/**
	 * @param path  path below /api/analytics/tenants/{tenantId}, e.g. 'roster'
	 * @param tenantId  MUST come from the authenticated principal
	 */
	async get<T>(
		path: string,
		tenantId: string,
		query: Record<string, string | undefined> = {},
	): Promise<T> {
		if (!tenantId) {
			// A missing tenant on an authenticated request means the token was
			// issued without one. Failing here prevents building a URL that
			// would read some other tenant's data.
			throw new InternalServerErrorException(
				'No tenant on the authenticated principal',
			);
		}

		const url = new URL(
			`${this.config.baseUrl}/api/analytics/tenants/${encodeURIComponent(tenantId)}/${path}`,
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

			// 404 is a real answer (no such template) and is worth forwarding.
			// Everything else is an upstream fault the client cannot act on, so
			// it becomes a 502 rather than leaking analytics-service's shape.
			if (response.status === 404) {
				throw new NotFoundException('Analytics resource not found');
			}

			const body = await response.text().catch(() => '');
			this.logger.error(
				`analytics-service ${response.status} for ${path}: ${body.slice(0, 300)}`,
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
