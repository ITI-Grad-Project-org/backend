package com.coachhub.analytics.web;

import com.coachhub.analytics.dto.ActivityEvent;
import com.coachhub.analytics.dto.AdherenceSummary;
import com.coachhub.analytics.dto.AttentionQueue;
import com.coachhub.analytics.dto.ClientProgress;
import com.coachhub.analytics.dto.CoachOverview;
import com.coachhub.analytics.dto.RosterReport;
import com.coachhub.analytics.dto.TemplateEffectiveness;
import com.coachhub.analytics.dto.TemplateSurvival;
import com.coachhub.analytics.service.AnalyticsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/analytics")
@Tag(
				name = "Analytics",
				description =
								"Read-only reporting over core-api's live data. Every route is scoped by the "
												+ "tenant in the path; core-api takes that from the coach's token and this "
												+ "service is never reachable from a browser.")
public class AnalyticsController {

	private final AnalyticsService analytics;

	public AnalyticsController(AnalyticsService analytics) {
		this.analytics = analytics;
	}

	@GetMapping("/tenants/{tenantId}/overview")
	@Operation(
					summary = "Coach home screen",
					description =
									"The whole above-the-fold dashboard in one call: roster counters and MRR, "
													+ "headline session adherence, this week's volume against last week's, and "
													+ "the size of each attention queue. The three counts are badges — call "
													+ "/attention for the rows behind them, which are computed at the same "
													+ "default thresholds so a badge and its list always agree.")
	@ApiResponses({
					@ApiResponse(responseCode = "200", description = "Overview for the window"),
					@ApiResponse(responseCode = "400", description = "'to' is before 'from'", content =
					@io.swagger.v3.oas.annotations.media.Content)
	})
	public CoachOverview overview(
					@Parameter(description = "Tenant (coaching practice) id", required = true)
					@PathVariable
					UUID tenantId,
					@Parameter(description = "Inclusive start. Defaults to 29 days before `to`.")
					@RequestParam(required = false)
					@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
					LocalDate from,
					@Parameter(
									description =
													"Inclusive end, and the date 'this week' is derived from. Defaults to today.")
					@RequestParam(required = false)
					@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
					LocalDate to) {
		return analytics.overview(tenantId, from, to);
	}

	@GetMapping("/tenants/{tenantId}/attention")
	@Operation(
					summary = "Needs you now",
					description =
									"The three queues that decay without a coach: clients who have gone quiet, "
													+ "check-ins submitted and unanswered, and programmes about to run out. "
													+ "Each is sorted most-urgent-first. Silence is measured from the last "
													+ "activity of any kind and falls back to the join date, so a client who "
													+ "signed up yesterday is not reported as abandoned.")
	@ApiResponses({
					@ApiResponse(responseCode = "200", description = "The attention queues"),
					@ApiResponse(
									responseCode = "400",
									description = "A threshold was below 1",
									content = @io.swagger.v3.oas.annotations.media.Content)
	})
	public AttentionQueue attention(
					@Parameter(required = true) @PathVariable UUID tenantId,
					@Parameter(description = "Measure urgency from this date. Defaults to today.")
					@RequestParam(required = false)
					@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
					LocalDate asOf,
					@Parameter(description = "Days of silence before a client is listed. Default 7.")
					@RequestParam(required = false)
					Integer riskThresholdDays,
					@Parameter(description = "How far ahead to report programme endings. Default 14.")
					@RequestParam(required = false)
					Integer endingHorizonDays) {
		return analytics.attention(tenantId, asOf, riskThresholdDays, endingHorizonDays);
	}

	@GetMapping("/tenants/{tenantId}/activity")
	@Operation(
					summary = "Activity feed",
					description =
									"What clients logged, newest first. Ordered by the instant each thing "
													+ "happened rather than by its training date, because the training date is "
													+ "the client's own local day and cannot order a feed within it. Rows "
													+ "disappear when a client un-logs something: this is the current claim, "
													+ "not an audit trail.")
	@ApiResponses({
					@ApiResponse(responseCode = "200", description = "Feed rows"),
					@ApiResponse(
									responseCode = "400",
									description = "'to' is before 'from', or limit below 1",
									content = @io.swagger.v3.oas.annotations.media.Content)
	})
	public List<ActivityEvent> activity(
					@Parameter(required = true) @PathVariable UUID tenantId,
					@Parameter(description = "Inclusive start. Defaults to 29 days before `to`.")
					@RequestParam(required = false)
					@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
					LocalDate from,
					@Parameter(description = "Inclusive end. Defaults to today.")
					@RequestParam(required = false)
					@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
					LocalDate to,
					@Parameter(description = "Max rows. Default 50, capped at 200.")
					@RequestParam(required = false)
					Integer limit) {
		return analytics.activity(tenantId, from, to, limit);
	}

	@GetMapping("/tenants/{tenantId}/clients/{membershipId}/progress")
	@Operation(
					summary = "Client outcomes",
					description =
									"Body measurements and estimated strength for one client. Everything else "
													+ "on this API measures whether the work got done; this measures whether it "
													+ "worked. Strength uses the Epley estimate from each logged set and is "
													+ "capped at 12 reps, above which the formula inflates enough to invent "
													+ "personal bests. Measurements are returned exactly as recorded, with gaps "
													+ "left as nulls rather than carried forward.")
	@ApiResponses({
					@ApiResponse(responseCode = "200", description = "Progress report"),
					@ApiResponse(responseCode = "404", description = "No such client for this tenant", content =
					@io.swagger.v3.oas.annotations.media.Content)
	})
	public ClientProgress clientProgress(
					@Parameter(required = true) @PathVariable UUID tenantId,
					@Parameter(description = "The client's membership id", required = true)
					@PathVariable
					UUID membershipId,
					@Parameter(description = "Inclusive start. Defaults to 29 days before `to`.")
					@RequestParam(required = false)
					@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
					LocalDate from,
					@Parameter(description = "Inclusive end. Defaults to today.")
					@RequestParam(required = false)
					@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
					LocalDate to) {
		return analytics.clientProgress(tenantId, membershipId, from, to);
	}

	@GetMapping("/tenants/{tenantId}/roster")
	@Operation(
					summary = "Roster health",
					description =
									"Status mix, MRR per currency, and every client ranked worst-adherence-first "
													+ "so the risk list and the leaderboard are the same call. Clients with "
													+ "nothing scheduled sort last and report a null adherence.")
	@ApiResponses({
					@ApiResponse(responseCode = "200", description = "Roster report for the window"),
					@ApiResponse(responseCode = "400", description = "'to' is before 'from'", content =
					@io.swagger.v3.oas.annotations.media.Content)
	})
	public RosterReport roster(
					@Parameter(description = "Tenant (coaching practice) id", required = true)
					@PathVariable
					UUID tenantId,
					@Parameter(description = "Inclusive start. Defaults to 29 days before `to`.")
					@RequestParam(required = false)
					@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
					LocalDate from,
					@Parameter(description = "Inclusive end. Defaults to today.")
					@RequestParam(required = false)
					@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
					LocalDate to) {
		return analytics.roster(tenantId, from, to);
	}

	@GetMapping("/tenants/{tenantId}/adherence")
	@Operation(
					summary = "Adherence against the prescription",
					description =
									"Two independent readings. Session completion counts logged sessions against "
													+ "the sessions the programme scheduled — not against sessions that were "
													+ "started, so days a client never opened still count. Volume adherence "
													+ "compares actual reps x weight against the prescription carried on each "
													+ "logged set; sets prescribed by RPE or %1RM have no absolute target and "
													+ "are excluded, so read the ratio next to `comparableSets`.")
	@ApiResponses({
					@ApiResponse(responseCode = "200", description = "Adherence summary"),
					@ApiResponse(responseCode = "400", description = "'to' is before 'from'", content =
					@io.swagger.v3.oas.annotations.media.Content)
	})
	public AdherenceSummary adherence(
					@Parameter(required = true) @PathVariable UUID tenantId,
					@Parameter(description = "Narrow to one client. Omit for the whole tenant.")
					@RequestParam(required = false)
					UUID membershipId,
					@Parameter(description = "Inclusive start. Defaults to 29 days before `to`.")
					@RequestParam(required = false)
					@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
					LocalDate from,
					@Parameter(description = "Inclusive end. Defaults to today.")
					@RequestParam(required = false)
					@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
					LocalDate to) {
		return analytics.adherence(tenantId, membershipId, from, to);
	}

	@GetMapping("/tenants/{tenantId}/programs/effectiveness")
	@Operation(
					summary = "Programme effectiveness by template",
					description =
									"Compares templates on how they perform once assigned, aggregated through "
													+ "`programs.source_template_id`. Ordered by how widely each template has "
													+ "been used. Not date-windowed: a template's track record is its whole "
													+ "history, and a window would rank templates by how recently they were "
													+ "assigned. Read `avgLastActiveWeek` against `durationWeeks` — that gap "
													+ "is where the template is losing people.")
	public List<TemplateEffectiveness> programEffectiveness(
					@Parameter(required = true) @PathVariable UUID tenantId) {
		return analytics.programEffectiveness(tenantId);
	}

	@GetMapping("/tenants/{tenantId}/programs/{templateId}/survival")
	@Operation(
					summary = "Template retention curve",
					description =
									"Week-by-week share of derived programmes still training. A programme reaches "
													+ "week N if its last completed session was in week N or later, so the "
													+ "curve never rises and the week it drops is the week the template loses "
													+ "people. Emits a row per planned week, including dead ones, so it can be "
													+ "plotted without filling gaps.")
	@ApiResponses({
					@ApiResponse(responseCode = "200", description = "Retention curve"),
					@ApiResponse(responseCode = "404", description = "No such template for this tenant", content =
					@io.swagger.v3.oas.annotations.media.Content)
	})
	public TemplateSurvival programSurvival(
					@Parameter(required = true) @PathVariable UUID tenantId,
					@Parameter(description = "A programme with programType=template", required = true)
					@PathVariable
					UUID templateId) {
		return analytics.programSurvival(tenantId, templateId);
	}

	@ExceptionHandler(IllegalArgumentException.class)
	ProblemDetail badRequest(IllegalArgumentException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
	}

	@ExceptionHandler(NoSuchElementException.class)
	ProblemDetail notFound(NoSuchElementException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
	}
}
