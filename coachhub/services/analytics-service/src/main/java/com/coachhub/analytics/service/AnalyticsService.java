package com.coachhub.analytics.service;

import com.coachhub.analytics.dto.ActivityEvent;
import com.coachhub.analytics.dto.AdherenceSummary;
import com.coachhub.analytics.dto.AtRiskClient;
import com.coachhub.analytics.dto.AttentionQueue;
import com.coachhub.analytics.dto.ClientProgress;
import com.coachhub.analytics.dto.CoachOverview;
import com.coachhub.analytics.dto.EndingProgram;
import com.coachhub.analytics.dto.PendingCheckin;
import com.coachhub.analytics.dto.RosterReport;
import com.coachhub.analytics.dto.SessionTrend;
import com.coachhub.analytics.dto.TemplateEffectiveness;
import com.coachhub.analytics.dto.TemplateSurvival;
import com.coachhub.analytics.repository.ActivityFeedQueryRepository;
import com.coachhub.analytics.repository.AdherenceQueryRepository;
import com.coachhub.analytics.repository.AttentionQueryRepository;
import com.coachhub.analytics.repository.ClientProgressQueryRepository;
import com.coachhub.analytics.repository.ProgramEffectivenessQueryRepository;
import com.coachhub.analytics.repository.RosterQueryRepository;
import com.coachhub.analytics.repository.SessionTrendQueryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
public class AnalyticsService {

	private static final int DEFAULT_WINDOW_DAYS = 30;

	/** Days of silence before an active client is worth surfacing. */
	public static final int DEFAULT_RISK_THRESHOLD_DAYS = 7;

	/** How far ahead a programme ending is worth surfacing. */
	public static final int DEFAULT_ENDING_HORIZON_DAYS = 14;

	public static final int DEFAULT_FEED_LIMIT = 50;
	public static final int MAX_FEED_LIMIT = 200;

	private final RosterQueryRepository rosterQueries;
	private final AdherenceQueryRepository adherenceQueries;
	private final ProgramEffectivenessQueryRepository programQueries;
	private final SessionTrendQueryRepository trendQueries;
	private final AttentionQueryRepository attentionQueries;
	private final ActivityFeedQueryRepository activityQueries;
	private final ClientProgressQueryRepository progressQueries;

	public AnalyticsService(
					RosterQueryRepository rosterQueries,
					AdherenceQueryRepository adherenceQueries,
					ProgramEffectivenessQueryRepository programQueries,
					SessionTrendQueryRepository trendQueries,
					AttentionQueryRepository attentionQueries,
					ActivityFeedQueryRepository activityQueries,
					ClientProgressQueryRepository progressQueries) {
		this.rosterQueries = rosterQueries;
		this.adherenceQueries = adherenceQueries;
		this.programQueries = programQueries;
		this.trendQueries = trendQueries;
		this.attentionQueries = attentionQueries;
		this.activityQueries = activityQueries;
		this.progressQueries = progressQueries;
	}

	/**
	 * The coach home screen.
	 *
	 * <p>The three attention counts are taken as the size of the same lists {@code /attention}
	 * returns, at the same default thresholds, rather than from separate COUNT queries. A badge that
	 * says 3 over a list that holds 2 is the kind of bug users notice immediately and nobody can
	 * reproduce, and these lists are a single coach's work queue — small by construction.
	 */
	@Transactional(readOnly = true)
	public CoachOverview overview(UUID tenantId, LocalDate from, LocalDate to) {
		Window window = Window.resolve(from, to);
		LocalDate asOf = window.to();
		LocalDate weekStart = asOf.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));

		return new CoachOverview(
						window.from(),
						asOf,
						rosterQueries.summary(tenantId),
						adherenceQueries.sessionCompletionPct(tenantId, window.from(), asOf),
						attentionQueries.checkinsAwaitingReview(tenantId, asOf).size(),
						attentionQueries.atRisk(tenantId, asOf, DEFAULT_RISK_THRESHOLD_DAYS).size(),
						attentionQueries
										.programsEndingSoon(tenantId, asOf, DEFAULT_ENDING_HORIZON_DAYS)
										.size(),
						trendQueries.trend(tenantId, weekStart, weekStart.plusDays(6)));
	}

	@Transactional(readOnly = true)
	public AttentionQueue attention(
					UUID tenantId, LocalDate asOf, Integer riskThresholdDays, Integer endingHorizonDays) {
		LocalDate reference = asOf == null ? LocalDate.now() : asOf;
		int threshold = positive(riskThresholdDays, DEFAULT_RISK_THRESHOLD_DAYS, "riskThresholdDays");
		int horizon = positive(endingHorizonDays, DEFAULT_ENDING_HORIZON_DAYS, "endingHorizonDays");

		List<AtRiskClient> atRisk = attentionQueries.atRisk(tenantId, reference, threshold);
		List<PendingCheckin> checkins = attentionQueries.checkinsAwaitingReview(tenantId, reference);
		List<EndingProgram> ending =
						attentionQueries.programsEndingSoon(tenantId, reference, horizon);

		return new AttentionQueue(reference, threshold, horizon, atRisk, checkins, ending);
	}

	@Transactional(readOnly = true)
	public List<ActivityEvent> activity(
					UUID tenantId, LocalDate from, LocalDate to, Integer limit) {
		Window window = Window.resolve(from, to);
		int rows = limit == null ? DEFAULT_FEED_LIMIT : limit;
		if (rows < 1) {
			throw new IllegalArgumentException("'limit' must be at least 1");
		}
		return activityQueries.feed(tenantId, window.from(), window.to(), Math.min(rows, MAX_FEED_LIMIT));
	}

	@Transactional(readOnly = true)
	public ClientProgress clientProgress(
					UUID tenantId, UUID membershipId, LocalDate from, LocalDate to) {
		Window window = Window.resolve(from, to);
		ClientProgressQueryRepository.MembershipRef membership =
						progressQueries.findMembership(tenantId, membershipId);
		if (membership == null) {
			throw new NoSuchElementException("No such client for this tenant");
		}

		return new ClientProgress(
						membership.membershipId(),
						membership.clientName(),
						window.from(),
						window.to(),
						progressQueries.measurements(tenantId, membershipId, window.from(), window.to()),
						progressQueries.strength(tenantId, membershipId, window.from(), window.to()));
	}

	@Transactional(readOnly = true)
	public RosterReport roster(UUID tenantId, LocalDate from, LocalDate to) {
		Window window = Window.resolve(from, to);
		return new RosterReport(
						window.from(),
						window.to(),
						rosterQueries.summary(tenantId),
						rosterQueries.clients(tenantId, window.from(), window.to()));
	}

	@Transactional(readOnly = true)
	public AdherenceSummary adherence(
					UUID tenantId, UUID membershipId, LocalDate from, LocalDate to) {
		Window window = Window.resolve(from, to);
		return adherenceQueries.summary(tenantId, membershipId, window.from(), window.to());
	}

	@Transactional(readOnly = true)
	public List<TemplateEffectiveness> programEffectiveness(UUID tenantId) {
		return programQueries.effectiveness(tenantId);
	}

	@Transactional(readOnly = true)
	public TemplateSurvival programSurvival(UUID tenantId, UUID templateId) {
		String name = programQueries.templateName(tenantId, templateId);
		if (name == null) {
			throw new NoSuchElementException("No such template for this tenant");
		}

		return new TemplateSurvival(
						templateId.toString(),
						name,
						programQueries.derivedCount(tenantId, templateId),
						programQueries.survival(tenantId, templateId));
	}

	/** Rejects zero and negatives rather than quietly substituting the default. */
	private static int positive(Integer value, int fallback, String name) {
		if (value == null) {
			return fallback;
		}
		if (value < 1) {
			throw new IllegalArgumentException("'" + name + "' must be at least 1");
		}
		return value;
	}

	private record Window(LocalDate from, LocalDate to) {

		static Window resolve(LocalDate from, LocalDate to) {
			if (from == null && to == null) {
				LocalDate today = LocalDate.now();
				return new Window(today.minusDays(DEFAULT_WINDOW_DAYS - 1L), today);
			}
			if (from == null) {
				return new Window(to.minusDays(DEFAULT_WINDOW_DAYS - 1L), to);
			}
			if (to == null) {
				return new Window(from, from.plusDays(DEFAULT_WINDOW_DAYS - 1L));
			}
			if (to.isBefore(from)) {
				throw new IllegalArgumentException("'to' must not be before 'from'");
			}
			return new Window(from, to);
		}
	}
}
