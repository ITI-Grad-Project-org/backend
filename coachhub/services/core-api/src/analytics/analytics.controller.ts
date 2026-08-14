import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
	ApiBadGatewayResponse,
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentTenant } from '../auth';
import { AnalyticsProxyService } from './analytics-proxy.service';
import {
	AdherenceQueryDto,
	AnalyticsWindowDto,
} from './dto/analytics-query.dto';

/**
 * Coach-facing analytics. Every route reads the tenant from the caller's token
 * and forwards to analytics-service in-cluster; there is deliberately no route
 * that accepts a tenant id from the client.
 *
 * Response bodies are analytics-service's own DTOs, documented in full at that
 * service's /swagger-ui. They are passed through unchanged rather than
 * re-declared here, so the two cannot drift.
 */
@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
	constructor(private readonly analytics: AnalyticsProxyService) {}

	@Get('roster')
	@ApiOperation({
		summary: 'Roster health',
		description:
			'Status mix, MRR per currency, and every client ranked worst-adherence-first, ' +
			'so the risk list and the leaderboard are one call. Clients with nothing ' +
			'scheduled sort last and report `adherencePct: null` — null means "nothing ' +
			'was scheduled", not "0% adherent", and the two must not be charted alike.',
	})
	@ApiOkResponse({
		description: 'RosterReport — see analytics-service /swagger-ui',
	})
	@ApiUnauthorizedResponse({ description: 'A valid coach token is required' })
	@ApiBadGatewayResponse({
		description: 'Analytics service unavailable or timed out',
	})
	roster(
		@CurrentTenant() tenantId: string,
		@Query() query: AnalyticsWindowDto,
	) {
		return this.analytics.get('roster', tenantId, {
			from: query.from,
			to: query.to,
		});
	}

	@Get('adherence')
	@ApiOperation({
		summary: 'Adherence against the prescription',
		description:
			'Session completion counts logged sessions against the sessions the ' +
			'programme scheduled — not against sessions that were started — so days a ' +
			'client never opened still count against them. Volume adherence compares ' +
			'actual reps × weight with the prescription stored on each logged set; sets ' +
			'prescribed by RPE or %1RM have no absolute target and are excluded, so read ' +
			'`volumeAdherencePct` next to `comparableSets`.',
	})
	@ApiOkResponse({
		description: 'AdherenceSummary — see analytics-service /swagger-ui',
	})
	@ApiUnauthorizedResponse({ description: 'A valid coach token is required' })
	@ApiBadGatewayResponse({
		description: 'Analytics service unavailable or timed out',
	})
	adherence(
		@CurrentTenant() tenantId: string,
		@Query() query: AdherenceQueryDto,
	) {
		return this.analytics.get('adherence', tenantId, {
			membershipId: query.membershipId,
			from: query.from,
			to: query.to,
		});
	}

	@Get('programs/effectiveness')
	@ApiOperation({
		summary: 'Programme effectiveness by template',
		description:
			'Compares templates on how they perform once assigned. Not date-windowed: a ' +
			'template’s track record is its whole history, and a window would rank ' +
			'templates by how recently they happened to be used. Read `avgLastActiveWeek` ' +
			'against `durationWeeks` — that gap is where the template loses people.',
	})
	@ApiOkResponse({
		description: 'TemplateEffectiveness[] — see analytics-service /swagger-ui',
	})
	@ApiUnauthorizedResponse({ description: 'A valid coach token is required' })
	programEffectiveness(@CurrentTenant() tenantId: string) {
		return this.analytics.get('programs/effectiveness', tenantId);
	}

	@Get('programs/:templateId/survival')
	@ApiOperation({
		summary: 'Template retention curve',
		description:
			'Week-by-week share of clients still training on a template. A programme ' +
			'reaches week N if its last completed session was in week N or later, so the ' +
			'curve never rises and the week it drops is the week the template loses ' +
			'people. Emits a row per planned week, including dead ones, so it can be ' +
			'plotted without filling gaps.',
	})
	@ApiOkResponse({
		description: 'TemplateSurvival — see analytics-service /swagger-ui',
	})
	@ApiUnauthorizedResponse({ description: 'A valid coach token is required' })
	programSurvival(
		@CurrentTenant() tenantId: string,
		@Param('templateId', new ParseUUIDPipe()) templateId: string,
	) {
		return this.analytics.get(`programs/${templateId}/survival`, tenantId);
	}
}
