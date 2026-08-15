package com.coachhub.analytics.repository;

import com.coachhub.analytics.dto.ActivityEvent;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

/** The raw "today's activity" stream: what clients logged, newest first. */
@Repository
public class ActivityFeedQueryRepository {

	/**
	 * Joined to clients on {@code client_id} rather than through the membership, because
	 * {@code membership_id} is nullable — activity survives a membership being detached, and an
	 * inner join through it would silently drop those rows from the feed.
	 *
	 * <p>Ordered by {@code occurred_at}, not {@code activity_date}: the date is the client's local
	 * training day and several share one value, so it cannot order a feed within a day.
	 */
	private static final String FEED_SQL =
					"""
									SELECT al.membership_id::text AS membership_id,
									       %s                     AS client_name,
									       al.activity_type::text AS activity_type,
									       al.activity_date       AS activity_date,
									       al.occurred_at         AS occurred_at
									FROM activity_logs al
									LEFT JOIN clients c ON c.id = al.client_id
									WHERE al.tenant_id = :tenantId
									  AND al.activity_date BETWEEN :fromDate AND :toDate
									ORDER BY al.occurred_at DESC
									LIMIT :maxRows
									"""
									.formatted(SqlFragments.CLIENT_NAME);

	private final NamedParameterJdbcTemplate jdbc;

	public ActivityFeedQueryRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public List<ActivityEvent> feed(UUID tenantId, LocalDate from, LocalDate to, int maxRows) {
		MapSqlParameterSource params =
						new MapSqlParameterSource()
										.addValue("tenantId", tenantId)
										.addValue("fromDate", from)
										.addValue("toDate", to)
										.addValue("maxRows", maxRows);

		return jdbc.query(
						FEED_SQL,
						params,
						(rs, rowNum) -> {
							Timestamp occurred = rs.getTimestamp("occurred_at");
							return new ActivityEvent(
											rs.getString("membership_id"),
											rs.getString("client_name"),
											rs.getString("activity_type"),
											rs.getObject("activity_date", LocalDate.class),
											occurred == null
															? null
															: OffsetDateTime.ofInstant(occurred.toInstant(), ZoneOffset.UTC));
						});
	}
}
