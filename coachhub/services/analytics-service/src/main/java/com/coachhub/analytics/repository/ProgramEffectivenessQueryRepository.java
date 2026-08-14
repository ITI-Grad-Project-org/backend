package com.coachhub.analytics.repository;

import com.coachhub.analytics.dto.SurvivalPoint;
import com.coachhub.analytics.dto.TemplateEffectiveness;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Programme effectiveness, aggregated through {@code programs.source_template_id}.
 *
 * <p>The link already exists in core-api's schema — assigning a template copies
 * it into a client programme and records the parent — so comparing templates
 * costs nothing beyond these queries.
 */
@Repository
public class ProgramEffectivenessQueryRepository {

    /**
     * Published, non-archived client programmes that came from a template.
     * Unlike the roster queries this is deliberately not date-windowed: a
     * template's track record is its whole history, and clipping it to 30 days
     * would rank templates by how recently they were assigned.
     */
    private static final String DERIVED_CTE =
            """
            derived AS (
                SELECT p.id, p.source_template_id, p.membership_id
                FROM programs p
                WHERE p.tenant_id = :tenantId
                  AND p.program_type = 'client'
                  AND p.source_template_id IS NOT NULL
                  AND p.status = 'published'
                  AND NOT p.is_archived
            )
            """;

    private static final String EFFECTIVENESS_SQL =
            """
            WITH %s,
            scheduled AS (
                SELECT d.id AS program_id, count(*) AS sessions
                FROM derived d
                JOIN program_weeks w  ON w.program_id = d.id
                JOIN program_days  pd ON pd.program_week_id = w.id
                WHERE NOT pd.is_rest_day
                GROUP BY d.id
            ),
            completed AS (
                SELECT lw.program_id, count(*) AS sessions
                FROM logged_workouts lw
                JOIN derived d ON d.id = lw.program_id
                WHERE lw.status = 'completed'
                GROUP BY lw.program_id
            ),
            -- Last week each programme saw a completed session. Programmes with
            -- no completed session at all contribute NULL and are excluded from
            -- the mean rather than counted as week 0, which would understate a
            -- template because of clients who never started.
            last_week AS (
                SELECT d.id AS program_id, max(w.week_number) AS week
                FROM derived d
                JOIN program_weeks    w  ON w.program_id = d.id
                JOIN program_days     pd ON pd.program_week_id = w.id
                JOIN logged_workouts  lw ON lw.program_day_id = pd.id
                WHERE lw.status = 'completed'
                GROUP BY d.id
            )
            SELECT t.id::text                       AS template_id,
                   t.name                           AS template_name,
                   t.duration_weeks                 AS duration_weeks,
                   count(DISTINCT d.id)             AS programs_derived,
                   count(DISTINCT d.membership_id)  AS clients,
                   coalesce(sum(s.sessions), 0)     AS scheduled_sessions,
                   coalesce(sum(c.sessions), 0)     AS completed_sessions,
                   avg(lwk.week)                    AS avg_last_active_week
            FROM programs t
            JOIN derived   d  ON d.source_template_id = t.id
            LEFT JOIN scheduled s   ON s.program_id = d.id
            LEFT JOIN completed c   ON c.program_id = d.id
            LEFT JOIN last_week lwk ON lwk.program_id = d.id
            WHERE t.tenant_id = :tenantId
              AND t.program_type = 'template'
            GROUP BY t.id, t.name, t.duration_weeks
            ORDER BY count(DISTINCT d.id) DESC, t.name
            """
                    .formatted(DERIVED_CTE);

    /**
     * A programme "reaches" week N when its last completed session was in week N
     * or later, which is what makes the curve monotonic. generate_series drives
     * the weeks so a template with a dead week still emits a row — the frontend
     * can plot the array directly without filling gaps.
     */
    private static final String SURVIVAL_SQL =
            """
            WITH %s,
            last_week AS (
                SELECT d.id AS program_id, max(w.week_number) AS week
                FROM derived d
                JOIN program_weeks   w  ON w.program_id = d.id
                JOIN program_days    pd ON pd.program_week_id = w.id
                JOIN logged_workouts lw ON lw.program_day_id = pd.id
                WHERE d.source_template_id = :templateId
                  AND lw.status = 'completed'
                GROUP BY d.id
            ),
            total AS (
                SELECT count(*) AS programs
                FROM derived d
                WHERE d.source_template_id = :templateId
            )
            SELECT g.week                                        AS week,
                   count(l.program_id)                           AS programs_reaching,
                   (SELECT programs FROM total)                  AS programs_total
            FROM generate_series(
                     1,
                     greatest((SELECT coalesce(max(duration_weeks), 1)
                               FROM programs
                               WHERE id = :templateId), 1)
                 ) AS g(week)
            LEFT JOIN last_week l ON l.week >= g.week
            GROUP BY g.week
            ORDER BY g.week
            """
                    .formatted(DERIVED_CTE);

    private static final String DERIVED_COUNT_SQL =
            """
            WITH %s
            SELECT count(*) FROM derived d WHERE d.source_template_id = :templateId
            """
                    .formatted(DERIVED_CTE);

    private static final String TEMPLATE_NAME_SQL =
            """
            SELECT name FROM programs
            WHERE id = :templateId AND tenant_id = :tenantId AND program_type = 'template'
            """;

    private final NamedParameterJdbcTemplate jdbc;

    public ProgramEffectivenessQueryRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<TemplateEffectiveness> effectiveness(UUID tenantId) {
        return jdbc.query(
                EFFECTIVENESS_SQL,
                new MapSqlParameterSource("tenantId", tenantId),
                (rs, rowNum) -> {
                    long scheduled = rs.getLong("scheduled_sessions");
                    long completed = rs.getLong("completed_sessions");
                    BigDecimal avgWeek = rs.getBigDecimal("avg_last_active_week");
                    int durationWeeks = rs.getInt("duration_weeks");
                    // Must be read immediately: wasNull() reports on the most
                    // recent get, and every read below would reset it.
                    Integer duration = rs.wasNull() ? null : durationWeeks;

                    return new TemplateEffectiveness(
                            rs.getString("template_id"),
                            rs.getString("template_name"),
                            rs.getLong("programs_derived"),
                            rs.getLong("clients"),
                            scheduled,
                            completed,
                            percentage(
                                    BigDecimal.valueOf(completed), BigDecimal.valueOf(scheduled)),
                            avgWeek == null ? null : avgWeek.setScale(1, RoundingMode.HALF_UP),
                            duration);
                });
    }

    public List<SurvivalPoint> survival(UUID tenantId, UUID templateId) {
        MapSqlParameterSource params =
                new MapSqlParameterSource()
                        .addValue("tenantId", tenantId)
                        .addValue("templateId", templateId);

        return jdbc.query(
                SURVIVAL_SQL,
                params,
                (rs, rowNum) -> {
                    long reaching = rs.getLong("programs_reaching");
                    long total = rs.getLong("programs_total");
                    return new SurvivalPoint(
                            rs.getInt("week"),
                            reaching,
                            percentage(BigDecimal.valueOf(reaching), BigDecimal.valueOf(total)));
                });
    }

    public long derivedCount(UUID tenantId, UUID templateId) {
        Long count =
                jdbc.queryForObject(
                        DERIVED_COUNT_SQL,
                        new MapSqlParameterSource()
                                .addValue("tenantId", tenantId)
                                .addValue("templateId", templateId),
                        Long.class);
        return count == null ? 0L : count;
    }

    public String templateName(UUID tenantId, UUID templateId) {
        return jdbc.query(
                TEMPLATE_NAME_SQL,
                new MapSqlParameterSource()
                        .addValue("tenantId", tenantId)
                        .addValue("templateId", templateId),
                rs -> rs.next() ? rs.getString("name") : null);
    }

    private static BigDecimal percentage(BigDecimal numerator, BigDecimal denominator) {
        if (numerator == null
                || denominator == null
                || denominator.compareTo(BigDecimal.ZERO) == 0) {
            return null;
        }
        return numerator
                .multiply(BigDecimal.valueOf(100))
                .divide(denominator, 1, RoundingMode.HALF_UP);
    }
}
