import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
	ApiBadGatewayResponse,
	ApiBearerAuth,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentTenant } from '../auth';
import { AnalyticsProxyService } from './analytics-proxy.service';
import {
	ActivityQueryDto,
	AdherenceQueryDto,
	AnalyticsWindowDto,
	AttentionQueryDto,
} from './dto/analytics-query.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
	constructor(private readonly analytics: AnalyticsProxyService) {}

	@Get('overview')
	@ApiOperation({
		summary: 'Coach home screen',
		description:
			'The whole above-the-fold dashboard in one call: roster counters and MRR, ' +
			'headline session adherence, this week’s volume against last week’s, and how ' +
			'big each attention queue is. The three counts are badges — `GET ' +
			'/analytics/attention` returns the rows behind them, computed at the same ' +
			'default thresholds so a badge and its list never disagree.',
	})
	@ApiOkResponse({
		description: 'CoachOverview — see analytics-service /swagger-ui',
	})
	@ApiUnauthorizedResponse({ description: 'A valid coach token is required' })
	@ApiBadGatewayResponse({
		description: 'Analytics service unavailable or timed out',
	})
	overview(
		@CurrentTenant() tenantId: string,
		@Query() query: AnalyticsWindowDto,
	) {
		return this.analytics.get('overview', tenantId, {
			from: query.from,
			to: query.to,
		});
	}

	@Get('attention')
	@ApiOperation({
		summary: 'Needs you now',
		description:
			'The three queues that decay without a coach: clients who have gone quiet, ' +
			'check-ins submitted and unanswered, and programmes about to run out. Each ' +
			'arrives sorted most-urgent-first. Silence is measured from a client’s last ' +
			'activity of any kind and falls back to their join date, so someone who ' +
			'signed up yesterday is never reported as abandoned.',
	})
	@ApiOkResponse({
		description: 'AttentionQueue — see analytics-service /swagger-ui',
	})
	@ApiUnauthorizedResponse({ description: 'A valid coach token is required' })
	@ApiBadGatewayResponse({
		description: 'Analytics service unavailable or timed out',
	})
	attention(
		@CurrentTenant() tenantId: string,
		@Query() query: AttentionQueryDto,
	) {
		return this.analytics.get('attention', tenantId, {
			asOf: query.asOf,
			riskThresholdDays: query.riskThresholdDays,
			endingHorizonDays: query.endingHorizonDays,
		});
	}

	@Get('activity')
	@ApiOperation({
		summary: 'Activity feed',
		description:
			'What clients logged, newest first. Ordered by the instant each thing ' +
			'happened rather than by its training date, because that date is the ' +
			'client’s own local day and cannot order a feed within it. Rows disappear ' +
			'when a client un-logs something — this is the current claim, not an audit ' +
			'trail, so do not use it to reconstruct history.',
	})
	@ApiOkResponse({
		description: 'ActivityEvent[] — see analytics-service /swagger-ui',
	})
	@ApiUnauthorizedResponse({ description: 'A valid coach token is required' })
	@ApiBadGatewayResponse({
		description: 'Analytics service unavailable or timed out',
	})
	activity(
		@CurrentTenant() tenantId: string,
		@Query() query: ActivityQueryDto,
	) {
		return this.analytics.get('activity', tenantId, {
			from: query.from,
			to: query.to,
			limit: query.limit,
		});
	}

	@Get('clients/:membershipId/progress')
	@ApiOperation({
		summary: 'Client outcomes',
		description:
			'Body measurements and estimated strength for one client. The rest of this ' +
			'API measures whether the work got done; this measures whether it worked. ' +
			'Strength uses the Epley estimate from each logged set, capped at 12 reps — ' +
			'above that the formula inflates enough to invent personal bests. ' +
			'Measurements come back exactly as recorded, with gaps left null rather than ' +
			'carried forward, so a flat line means a flat client and not a missing entry.',
	})
	@ApiOkResponse({
		description: 'ClientProgress — see analytics-service /swagger-ui',
	})
	@ApiUnauthorizedResponse({ description: 'A valid coach token is required' })
	@ApiNotFoundResponse({ description: 'No such client for this coach' })
	@ApiBadGatewayResponse({
		description: 'Analytics service unavailable or timed out',
	})
	clientProgress(
		@CurrentTenant() tenantId: string,
		@Param('membershipId', new ParseUUIDPipe()) membershipId: string,
		@Query() query: AnalyticsWindowDto,
	) {
		return this.analytics.get(`clients/${membershipId}/progress`, tenantId, {
			from: query.from,
			to: query.to,
		});
	}

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
