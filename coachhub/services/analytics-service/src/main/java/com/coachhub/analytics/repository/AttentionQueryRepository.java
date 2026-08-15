package com.coachhub.analytics.repository;

import com.coachhub.analytics.dto.AtRiskClient;
import com.coachhub.analytics.dto.EndingProgram;
import com.coachhub.analytics.dto.PendingCheckin;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

/** The three coach work queues: who has gone quiet, who is waiting, and what is running out. */
@Repository
public class AttentionQueryRepository {

	/**
	 * Silence is measured against the last activity of any kind, falling back to the join date so a
	 * client who signed up two days ago and has not logged yet is not reported as abandoned.
	 *
	 * <p>Only active memberships qualify. A paused client is quiet on purpose, and listing them here
	 * would train the coach to ignore the list.
	 */
	private static final String AT_RISK_SQL =
					"""
									WITH activity AS (
									    SELECT al.membership_id, max(al.activity_date) AS last_activity
									    FROM activity_logs al
									    WHERE al.tenant_id = :tenantId
									      AND al.membership_id IS NOT NULL
									    GROUP BY al.membership_id
									)
									SELECT m.id::text            AS membership_id,
									       %s                    AS client_name,
									       a.last_activity       AS last_activity,
									       CAST(:asOf AS date)
									           - coalesce(a.last_activity, CAST(m.joined_at AS date))
									                             AS days_since
									FROM memberships m
									LEFT JOIN clients  c ON c.id = m.client_id
									LEFT JOIN activity a ON a.membership_id = m.id
									WHERE m.tenant_id = :tenantId
									  AND m.deleted_at IS NULL
									  AND m.status = 'active'
									  AND coalesce(a.last_activity, CAST(m.joined_at AS date))
									      <= CAST(:asOf AS date) - CAST(:thresholdDays AS int)
									ORDER BY days_since DESC, client_name
									"""
									.formatted(SqlFragments.CLIENT_NAME);

	/**
	 * Oldest submission first — this is a queue, and the client who has waited longest is the one
	 * closest to concluding nobody read it.
	 */
	private static final String PENDING_CHECKINS_SQL =
					"""
									SELECT ck.id::text            AS checkin_id,
									       ck.membership_id::text AS membership_id,
									       %s                     AS client_name,
									       ck.scheduled_for       AS scheduled_for,
									       ck.submitted_at        AS submitted_at,
									       CAST(:asOf AS date) - CAST(ck.submitted_at AS date) AS days_waiting
									FROM checkins ck
									JOIN memberships m ON m.id = ck.membership_id
									LEFT JOIN clients c ON c.id = m.client_id
									WHERE ck.tenant_id = :tenantId
									  AND ck.status = 'submitted'
									  AND m.deleted_at IS NULL
									ORDER BY ck.submitted_at
									"""
									.formatted(SqlFragments.CLIENT_NAME);

	/**
	 * The end date is derived in a CTE because SQL cannot reference a select alias from WHERE, and
	 * repeating the coalesce in both places is how the two drift apart.
	 *
	 * <p>Completion is over the programme's entire run rather than the reporting window: the
	 * question at renewal time is how this block went, not how last month went.
	 */
	private static final String ENDING_SQL =
					"""
									WITH ending AS (
									    SELECT p.id,
									           p.membership_id,
									           p.name,
									           %s AS ends_on
									    FROM programs p
									    WHERE p.tenant_id = :tenantId
									      AND p.program_type = 'client'
									      AND p.status = 'published'
									      AND NOT p.is_archived
									      AND p.start_date IS NOT NULL
									      AND p.membership_id IS NOT NULL
									),
									scheduled AS (
									    SELECT p.id AS program_id, count(*) AS sessions
									    FROM programs p
									    JOIN ending        e  ON e.id = p.id
									    JOIN program_weeks w  ON w.program_id = p.id
									    JOIN program_days  d  ON d.program_week_id = w.id
									    WHERE NOT d.is_rest_day
									    GROUP BY p.id
									),
									completed AS (
									    SELECT lw.program_id, count(*) AS sessions
									    FROM logged_workouts lw
									    JOIN ending e ON e.id = lw.program_id
									    WHERE lw.status = 'completed'
									    GROUP BY lw.program_id
									)
									SELECT e.id::text            AS program_id,
									       e.membership_id::text AS membership_id,
									       %s                    AS client_name,
									       e.name                AS program_name,
									       e.ends_on             AS ends_on,
									       e.ends_on - CAST(:asOf AS date) AS days_remaining,
									       coalesce(s.sessions, 0) AS scheduled_sessions,
									       coalesce(f.sessions, 0) AS completed_sessions
									FROM ending e
									JOIN memberships m ON m.id = e.membership_id
									LEFT JOIN clients   c ON c.id = m.client_id
									LEFT JOIN scheduled s ON s.program_id = e.id
									LEFT JOIN completed f ON f.program_id = e.id
									WHERE m.deleted_at IS NULL
									  AND e.ends_on BETWEEN CAST(:asOf AS date)
									                    AND CAST(:asOf AS date) + CAST(:horizonDays AS int)
									ORDER BY e.ends_on, client_name
									"""
									.formatted(SqlFragments.DERIVED_END_DATE, SqlFragments.CLIENT_NAME);

	private final NamedParameterJdbcTemplate jdbc;

	public AttentionQueryRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	private static BigDecimal percentage(long numerator, long denominator) {
		if (denominator == 0) {
			return null;
		}
		return BigDecimal.valueOf(numerator)
		                 .multiply(BigDecimal.valueOf(100))
		                 .divide(BigDecimal.valueOf(denominator), 1, RoundingMode.HALF_UP);
	}

	public List<AtRiskClient> atRisk(UUID tenantId, LocalDate asOf, int thresholdDays) {
		MapSqlParameterSource params =
						new MapSqlParameterSource()
										.addValue("tenantId", tenantId)
										.addValue("asOf", asOf)
										.addValue("thresholdDays", thresholdDays);

		return jdbc.query(
						AT_RISK_SQL,
						params,
						(rs, rowNum) -> {
							LocalDate lastActivity = rs.getObject("last_activity", LocalDate.class);
							return new AtRiskClient(
											rs.getString("membership_id"),
											rs.getString("client_name"),
											lastActivity,
											rs.getLong("days_since"),
											lastActivity == null);
						});
	}

	public List<PendingCheckin> checkinsAwaitingReview(UUID tenantId, LocalDate asOf) {
		MapSqlParameterSource params =
						new MapSqlParameterSource()
										.addValue("tenantId", tenantId)
										.addValue("asOf", asOf);

		return jdbc.query(
						PENDING_CHECKINS_SQL,
						params,
						(rs, rowNum) -> {
							Timestamp submitted = rs.getTimestamp("submitted_at");
							return new PendingCheckin(
											rs.getString("checkin_id"),
											rs.getString("membership_id"),
											rs.getString("client_name"),
											rs.getObject("scheduled_for", LocalDate.class),
											submitted == null
															? null
															: OffsetDateTime.ofInstant(submitted.toInstant(), ZoneOffset.UTC),
											rs.getLong("days_waiting"));
						});
	}

	public List<EndingProgram> programsEndingSoon(UUID tenantId, LocalDate asOf, int horizonDays) {
		MapSqlParameterSource params =
						new MapSqlParameterSource()
										.addValue("tenantId", tenantId)
										.addValue("asOf", asOf)
										.addValue("horizonDays", horizonDays);

		return jdbc.query(
						ENDING_SQL,
						params,
						(rs, rowNum) ->
										new EndingProgram(
														rs.getString("program_id"),
														rs.getString("membership_id"),
														rs.getString("client_name"),
														rs.getString("program_name"),
														rs.getObject("ends_on", LocalDate.class),
														rs.getLong("days_remaining"),
														percentage(
																		rs.getLong("completed_sessions"),
																		rs.getLong("scheduled_sessions"))));
	}
}
