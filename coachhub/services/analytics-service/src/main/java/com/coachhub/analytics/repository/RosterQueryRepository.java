package com.coachhub.analytics.repository;

import com.coachhub.analytics.dto.ClientRosterRow;
import com.coachhub.analytics.dto.RosterSummary;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Roster queries against core-api's schema.
 *
 * <p>Native SQL rather than JPA entities on purpose: every figure here is a
 * GROUP BY rollup, and mirroring core-api's TypeORM entities into JPA classes
 * would add ~30 mappings that can silently drift out of step with a schema this
 * service does not own. A missing column fails loudly here; a stale @Entity
 * mapping fails strangely.
 */
@Repository
public class RosterQueryRepository {

    /**
     * A programme day's calendar date is derived, not stored: program_days carry
     * (week_number, day_number) offsets and the programme carries start_date.
     * This mirrors core-api's own ck_programs_inclusive_dates constraint, which
     * defines end_date as start_date + (duration_weeks * 7 - 1).
     */
    private static final String SCHEDULED_DATE =
            "(p.start_date + ((w.week_number - 1) * 7 + (d.day_number - 1)))";

    private static final String SUMMARY_SQL =
            """
            SELECT count(*) FILTER (WHERE m.status = 'active')    AS active,
                   count(*) FILTER (WHERE m.status = 'paused')    AS paused,
                   count(*) FILTER (WHERE m.status = 'invited')   AS invited,
                   count(*) FILTER (WHERE m.status = 'requested') AS requested,
                   count(*) FILTER (WHERE m.status = 'archived')  AS archived
            FROM memberships m
            WHERE m.tenant_id = :tenantId
              AND m.deleted_at IS NULL
            """;

    /** Grouped by currency because there is no FX rate to collapse them with. */
    private static final String MRR_SQL =
            """
            SELECT m.currency, sum(m.monthly_price) AS mrr
            FROM memberships m
            WHERE m.tenant_id = :tenantId
              AND m.deleted_at IS NULL
              AND m.status = 'active'
              AND m.monthly_price IS NOT NULL
            GROUP BY m.currency
            """;

    private static final String CLIENTS_SQL =
            """
            WITH scheduled AS (
                SELECT p.membership_id, count(*) AS sessions
                FROM programs p
                JOIN program_weeks w ON w.program_id = p.id
                JOIN program_days  d ON d.program_week_id = w.id
                WHERE p.tenant_id = :tenantId
                  AND p.program_type = 'client'
                  AND p.status = 'published'
                  AND NOT p.is_archived
                  AND NOT d.is_rest_day
                  AND %s BETWEEN :fromDate AND :toDate
                GROUP BY p.membership_id
            ),
            completed AS (
                SELECT lw.membership_id, count(*) AS sessions
                FROM logged_workouts lw
                WHERE lw.tenant_id = :tenantId
                  AND lw.status = 'completed'
                  AND lw.scheduled_date BETWEEN :fromDate AND :toDate
                GROUP BY lw.membership_id
            ),
            activity AS (
                SELECT al.membership_id, max(al.activity_date) AS last_activity
                FROM activity_logs al
                WHERE al.tenant_id = :tenantId
                  AND al.membership_id IS NOT NULL
                GROUP BY al.membership_id
            )
            SELECT m.id,
                   trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) AS client_name,
                   m.status::text        AS status,
                   m.joined_at,
                   m.monthly_price,
                   m.currency,
                   coalesce(s.sessions, 0) AS scheduled_sessions,
                   coalesce(f.sessions, 0) AS completed_sessions,
                   a.last_activity
            FROM memberships m
            LEFT JOIN clients   c ON c.id = m.client_id
            LEFT JOIN scheduled s ON s.membership_id = m.id
            LEFT JOIN completed f ON f.membership_id = m.id
            LEFT JOIN activity  a ON a.membership_id = m.id
            WHERE m.tenant_id = :tenantId
              AND m.deleted_at IS NULL
            ORDER BY coalesce(s.sessions, 0) = 0,
                     coalesce(f.sessions, 0)::numeric
                         / nullif(coalesce(s.sessions, 0), 0) NULLS LAST,
                     client_name
            """
                    .formatted(SCHEDULED_DATE);

    private final NamedParameterJdbcTemplate jdbc;

    public RosterQueryRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public RosterSummary summary(UUID tenantId) {
        MapSqlParameterSource params = new MapSqlParameterSource("tenantId", tenantId);

        Map<String, BigDecimal> mrr = new HashMap<>();
        jdbc.query(
                MRR_SQL,
                params,
                rs -> {
                    mrr.put(rs.getString("currency").trim(), rs.getBigDecimal("mrr"));
                });

        return jdbc.queryForObject(
                SUMMARY_SQL,
                params,
                (rs, rowNum) ->
                        new RosterSummary(
                                rs.getLong("active"),
                                rs.getLong("paused"),
                                rs.getLong("invited"),
                                rs.getLong("requested"),
                                rs.getLong("archived"),
                                mrr));
    }

    public List<ClientRosterRow> clients(UUID tenantId, LocalDate from, LocalDate to) {
        MapSqlParameterSource params =
                new MapSqlParameterSource()
                        .addValue("tenantId", tenantId)
                        .addValue("fromDate", from)
                        .addValue("toDate", to);

        return jdbc.query(
                CLIENTS_SQL,
                params,
                (rs, rowNum) -> {
                    long scheduled = rs.getLong("scheduled_sessions");
                    long completed = rs.getLong("completed_sessions");
                    LocalDate lastActivity =
                            rs.getObject("last_activity", LocalDate.class);
                    java.sql.Timestamp joined = rs.getTimestamp("joined_at");

                    return new ClientRosterRow(
                            rs.getString("id"),
                            rs.getString("client_name"),
                            rs.getString("status"),
                            joined == null ? null : joined.toLocalDateTime().toLocalDate(),
                            scheduled,
                            completed,
                            percentage(completed, scheduled),
                            lastActivity,
                            lastActivity == null
                                    ? null
                                    : java.time.temporal.ChronoUnit.DAYS.between(
                                            lastActivity, to),
                            rs.getBigDecimal("monthly_price"),
                            trimmed(rs.getString("currency")));
                });
    }

    /** Null when the denominator is zero — "nothing scheduled" is not "0% adherent". */
    private static BigDecimal percentage(long numerator, long denominator) {
        if (denominator == 0) {
            return null;
        }
        return BigDecimal.valueOf(numerator)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(denominator), 1, RoundingMode.HALF_UP);
    }

    private static String trimmed(String value) {
        return value == null ? null : value.trim();
    }
}
