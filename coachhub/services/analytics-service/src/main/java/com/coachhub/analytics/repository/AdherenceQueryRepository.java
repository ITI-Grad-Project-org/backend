package com.coachhub.analytics.repository;

import com.coachhub.analytics.dto.AdherenceSummary;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

/**
 * Prescription-versus-result adherence, at session and set level.
 */
@Repository
public class AdherenceQueryRepository {

	private static final String SCHEDULED_DATE =
					"(p.start_date + ((w.week_number - 1) * 7 + (d.day_number - 1)))";

	private static final String SCHEDULED_SQL =
					"""
									SELECT count(*) AS scheduled
									FROM programs p
									JOIN program_weeks w ON w.program_id = p.id
									JOIN program_days  d ON d.program_week_id = w.id
									WHERE p.tenant_id = :tenantId
									  AND p.program_type = 'client'
									  AND p.status = 'published'
									  AND NOT p.is_archived
									  AND NOT d.is_rest_day
									  AND (CAST(:membershipId AS uuid) IS NULL
									       OR p.membership_id = CAST(:membershipId AS uuid))
									  AND %s BETWEEN :fromDate AND :toDate
									"""
									.formatted(SCHEDULED_DATE);

	private static final String SESSIONS_SQL =
					"""
									SELECT count(*) FILTER (WHERE lw.status = 'completed')   AS completed,
									       count(*) FILTER (WHERE lw.status = 'partial')     AS partial,
									       count(*) FILTER (WHERE lw.status = 'skipped')     AS skipped,
									       count(*) FILTER (WHERE lw.status = 'in_progress') AS in_progress
									FROM logged_workouts lw
									WHERE lw.tenant_id = :tenantId
									  AND (CAST(:membershipId AS uuid) IS NULL
									       OR lw.membership_id = CAST(:membershipId AS uuid))
									  AND lw.scheduled_date BETWEEN :fromDate AND :toDate
									""";

	private static final String VOLUME_SQL =
					"""
									SELECT count(*) FILTER (WHERE comparable)                     AS comparable_sets,
									       coalesce(sum(prescribed_volume) FILTER (WHERE comparable), 0) AS prescribed_volume,
									       coalesce(sum(actual_volume)     FILTER (WHERE comparable), 0) AS actual_volume,
									       count(*) FILTER (WHERE outcome = 'completed')          AS sets_completed,
									       count(*) FILTER (WHERE outcome = 'partial')            AS sets_partial,
									       count(*) FILTER (WHERE outcome = 'skipped')            AS sets_skipped,
									       count(*) FILTER (WHERE is_extra)                       AS sets_extra
									FROM (
									    SELECT ls.outcome::text AS outcome,
									           ls.is_extra,
									           (NOT ls.is_extra
									                AND ls.prescribed_weight_kg IS NOT NULL
									                AND ls.prescribed_reps_min  IS NOT NULL) AS comparable,
									           ls.prescribed_reps_min * ls.prescribed_weight_kg AS prescribed_volume,
									           CASE WHEN ls.outcome IN ('completed', 'partial')
									                THEN coalesce(ls.reps, 0) * coalesce(ls.weight_kg, 0)
									                ELSE 0
									           END AS actual_volume
									    FROM logged_sets ls
									    JOIN logged_exercises le ON le.id = ls.logged_exercise_id
									    JOIN logged_workouts  lw ON lw.id = le.logged_workout_id
									    WHERE lw.tenant_id = :tenantId
									      AND (CAST(:membershipId AS uuid) IS NULL
									       OR lw.membership_id = CAST(:membershipId AS uuid))
									      AND lw.scheduled_date BETWEEN :fromDate AND :toDate
									) s
									""";

	private final NamedParameterJdbcTemplate jdbc;

	public AdherenceQueryRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * Null when the denominator is zero, so "nothing prescribed" never reads as 0%.
	 */
	private static BigDecimal percentage(BigDecimal numerator, BigDecimal denominator) {
		if (denominator == null
						|| denominator.compareTo(BigDecimal.ZERO) == 0
						|| numerator == null) {
			return null;
		}
		return numerator
						.multiply(BigDecimal.valueOf(100))
						.divide(denominator, 1, RoundingMode.HALF_UP);
	}

	public AdherenceSummary summary(
					UUID tenantId, UUID membershipId, LocalDate from, LocalDate to) {
		MapSqlParameterSource params =
						new MapSqlParameterSource()
										.addValue("tenantId", tenantId)
										.addValue("membershipId", membershipId)
										.addValue("fromDate", from)
										.addValue("toDate", to);

		// Three sequential queries, each releasing its connection before the next.
		// Nesting one inside another's RowMapper would hold two of the five
		// pooled connections at once for every request.
		long scheduled =
						Optional.ofNullable(jdbc.queryForObject(SCHEDULED_SQL, params, Long.class))
						        .orElse(0L);

		SessionCounts sessions =
						jdbc.queryForObject(
										SESSIONS_SQL,
										params,
										(rs, rowNum) ->
														new SessionCounts(
																		rs.getLong("completed"),
																		rs.getLong("partial"),
																		rs.getLong("skipped"),
																		rs.getLong("in_progress")));

		VolumeCounts volume =
						jdbc.queryForObject(
										VOLUME_SQL,
										params,
										(rs, rowNum) ->
														new VolumeCounts(
																		rs.getLong("comparable_sets"),
																		rs.getBigDecimal("prescribed_volume"),
																		rs.getBigDecimal("actual_volume"),
																		rs.getLong("sets_completed"),
																		rs.getLong("sets_partial"),
																		rs.getLong("sets_skipped"),
																		rs.getLong("sets_extra")));

		return new AdherenceSummary(
						scheduled,
						sessions.completed(),
						sessions.partial(),
						sessions.skipped(),
						sessions.inProgress(),
						percentage(
										BigDecimal.valueOf(sessions.completed()), BigDecimal.valueOf(scheduled)),
						volume.comparableSets(),
						volume.prescribedVolume(),
						volume.actualVolume(),
						volume.comparableSets() == 0
										? null
										: percentage(volume.actualVolume(), volume.prescribedVolume()),
						volume.setsCompleted(),
						volume.setsPartial(),
						volume.setsSkipped(),
						volume.setsExtra());
	}

	private record SessionCounts(long completed, long partial, long skipped, long inProgress) {}

	private record VolumeCounts(
					long comparableSets,
					BigDecimal prescribedVolume,
					BigDecimal actualVolume,
					long setsCompleted,
					long setsPartial,
					long setsSkipped,
					long setsExtra) {}
}
