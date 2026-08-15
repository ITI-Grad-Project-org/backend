package com.coachhub.analytics.repository;

import com.coachhub.analytics.dto.DayCount;
import com.coachhub.analytics.dto.SessionTrend;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Sessions logged this week against last week, plus the per-weekday split behind the bar chart.
 */
@Repository
public class SessionTrendQueryRepository {

	/**
	 * Both weeks in one pass. A single scan bounded by the fortnight, split with FILTER, rather than
	 * two round trips over overlapping ranges.
	 */
	private static final String TREND_SQL =
					"""
									SELECT count(*) FILTER (WHERE lw.scheduled_date >= :weekStart) AS this_week,
									       count(*) FILTER (WHERE lw.scheduled_date <  :weekStart) AS previous_week
									FROM logged_workouts lw
									WHERE lw.tenant_id = :tenantId
									  AND lw.status = 'completed'
									  AND lw.scheduled_date BETWEEN :previousStart AND :weekEnd
									""";

	/**
	 * generate_series drives the row set so a day nobody trained still returns a zero. Left joining
	 * onto the calendar rather than grouping the table means the chart always has seven bars, and
	 * the gap between them is visible instead of collapsed.
	 */
	private static final String BY_DAY_SQL =
					"""
									SELECT CAST(g.d AS date)   AS day,
									       count(lw.id)         AS sessions
									FROM generate_series(
									         CAST(:weekStart AS date),
									         CAST(:weekEnd   AS date),
									         interval '1 day'
									     ) AS g(d)
									LEFT JOIN logged_workouts lw
									       ON lw.scheduled_date = CAST(g.d AS date)
									      AND lw.tenant_id      = :tenantId
									      AND lw.status         = 'completed'
									GROUP BY g.d
									ORDER BY g.d
									""";

	private final NamedParameterJdbcTemplate jdbc;

	public SessionTrendQueryRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * Null rather than 0 when the previous week was empty: there is no percentage change from a base
	 * of nothing, and 0 would render as "flat" when the truth is "this is the first week".
	 */
	private static BigDecimal changePct(long current, long previous) {
		if (previous == 0) {
			return null;
		}
		return BigDecimal.valueOf(current - previous)
		                 .multiply(BigDecimal.valueOf(100))
		                 .divide(BigDecimal.valueOf(previous), 1, RoundingMode.HALF_UP);
	}

	public SessionTrend trend(UUID tenantId, LocalDate weekStart, LocalDate weekEnd) {
		MapSqlParameterSource params =
						new MapSqlParameterSource()
										.addValue("tenantId", tenantId)
										.addValue("weekStart", weekStart)
										.addValue("weekEnd", weekEnd)
										.addValue("previousStart", weekStart.minusDays(7));

		Counts counts =
						jdbc.queryForObject(
										TREND_SQL,
										params,
										(rs, rowNum) ->
														new Counts(rs.getLong("this_week"), rs.getLong("previous_week")));

		List<DayCount> byDay =
						jdbc.query(
										BY_DAY_SQL,
										params,
										(rs, rowNum) -> {
											LocalDate day = rs.getObject("day", LocalDate.class);
											return new DayCount(
															day, day.getDayOfWeek().getValue(), rs.getLong("sessions"));
										});

		long thisWeek = counts == null ? 0L : counts.thisWeek();
		long previous = counts == null ? 0L : counts.previousWeek();

		return new SessionTrend(
						weekStart, weekEnd, thisWeek, previous, changePct(thisWeek, previous), byDay);
	}

	private record Counts(long thisWeek, long previousWeek) {}
}
