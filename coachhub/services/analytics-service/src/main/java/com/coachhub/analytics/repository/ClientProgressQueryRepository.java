package com.coachhub.analytics.repository;

import com.coachhub.analytics.dto.ExerciseStrength;
import com.coachhub.analytics.dto.MeasurementPoint;
import com.coachhub.analytics.dto.StrengthPoint;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Outcome data for a single client: body measurements and estimated strength over time. */
@Repository
public class ClientProgressQueryRepository {

	/**
	 * Resolves the membership within the tenant. Every other query here filters on tenant too, so
	 * this is not the security boundary — it exists so a membership belonging to another coach
	 * returns 404 rather than an empty but successful report, which reads as "this client has done
	 * nothing" instead of "this is not your client".
	 */
	private static final String MEMBERSHIP_SQL =
					"""
									SELECT m.id::text AS membership_id,
									       %s         AS client_name
									FROM memberships m
									LEFT JOIN clients c ON c.id = m.client_id
									WHERE m.id = :membershipId
									  AND m.tenant_id = :tenantId
									  AND m.deleted_at IS NULL
									"""
									.formatted(SqlFragments.CLIENT_NAME);

	private static final String MEASUREMENTS_SQL =
					"""
									SELECT ms.measured_at, ms.weight_kg, ms.body_fat_pct,
									       ms.chest_cm, ms.waist_cm, ms.hips_cm, ms.arm_cm, ms.thigh_cm
									FROM measurements ms
									WHERE ms.tenant_id = :tenantId
									  AND ms.membership_id = :membershipId
									  AND ms.measured_at BETWEEN :fromDate AND :toDate
									ORDER BY ms.measured_at
									""";

	/**
	 * Epley: 1RM ≈ weight × (1 + reps / 30).
	 *
	 * <p>Capped at 12 reps deliberately. Epley is fitted to low rep ranges and inflates fast beyond
	 * about a dozen — a 20-rep set would report a 1RM two thirds above the weight actually moved,
	 * and one high-rep finisher would put a spike in the chart that looks like a personal best. A
	 * missing point is recoverable; a fabricated PR is what the client screenshots.
	 *
	 * <p>Bodyweight and timed work carry no weight and drop out here. That is intended: this chart
	 * answers "is the load going up", which is not a question those sets can answer.
	 */
	private static final String STRENGTH_SQL =
					"""
									WITH working AS (
									    SELECT le.exercise_name  AS exercise_name,
									           lw.scheduled_date AS day,
									           ls.weight_kg * (1 + CAST(ls.reps AS numeric) / 30) AS e1rm,
									           ls.weight_kg * ls.reps                             AS volume
									    FROM logged_sets ls
									    JOIN logged_exercises le ON le.id = ls.logged_exercise_id
									    JOIN logged_workouts  lw ON lw.id = le.logged_workout_id
									    WHERE lw.tenant_id = :tenantId
									      AND lw.membership_id = :membershipId
									      AND lw.scheduled_date BETWEEN :fromDate AND :toDate
									      AND ls.outcome IN ('completed', 'partial')
									      AND ls.weight_kg IS NOT NULL
									      AND ls.weight_kg > 0
									      AND ls.reps IS NOT NULL
									      AND ls.reps BETWEEN 1 AND 12
									)
									SELECT exercise_name,
									       day,
									       max(e1rm)   AS best_e1rm,
									       count(*)    AS sets,
									       sum(volume) AS volume
									FROM working
									GROUP BY exercise_name, day
									ORDER BY exercise_name, day
									""";

	private final NamedParameterJdbcTemplate jdbc;

	public ClientProgressQueryRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	private static BigDecimal scaled(BigDecimal value) {
		return value == null ? null : value.setScale(2, RoundingMode.HALF_UP);
	}

	/** Null when there is only one point — a single reading is a measurement, not a trend. */
	private static BigDecimal changePct(BigDecimal first, BigDecimal latest, int points) {
		if (points < 2 || first == null || latest == null
						|| first.compareTo(BigDecimal.ZERO) == 0) {
			return null;
		}
		return latest.subtract(first)
		             .multiply(BigDecimal.valueOf(100))
		             .divide(first, 1, RoundingMode.HALF_UP);
	}

	/** Null when the membership does not belong to this tenant. */
	public MembershipRef findMembership(UUID tenantId, UUID membershipId) {
		return jdbc.query(
						MEMBERSHIP_SQL,
						new MapSqlParameterSource()
										.addValue("tenantId", tenantId)
										.addValue("membershipId", membershipId),
						rs ->
										rs.next()
														? new MembershipRef(
														rs.getString("membership_id"), rs.getString("client_name"))
														: null);
	}

	public List<MeasurementPoint> measurements(
					UUID tenantId, UUID membershipId, LocalDate from, LocalDate to) {
		return jdbc.query(
						MEASUREMENTS_SQL,
						params(tenantId, membershipId, from, to),
						(rs, rowNum) ->
										new MeasurementPoint(
														rs.getObject("measured_at", LocalDate.class),
														rs.getBigDecimal("weight_kg"),
														rs.getBigDecimal("body_fat_pct"),
														rs.getBigDecimal("chest_cm"),
														rs.getBigDecimal("waist_cm"),
														rs.getBigDecimal("hips_cm"),
														rs.getBigDecimal("arm_cm"),
														rs.getBigDecimal("thigh_cm")));
	}

	public List<ExerciseStrength> strength(
					UUID tenantId, UUID membershipId, LocalDate from, LocalDate to) {
		// Ordered by exercise then day in SQL, so each exercise's points arrive contiguous and
		// already chronological — the map only has to preserve insertion order.
		Map<String, List<StrengthPoint>> byExercise = new LinkedHashMap<>();

		// Statement body, not an expression: List.add returns boolean, which would make the lambda
		// match ResultSetExtractor as well as RowCallbackHandler and fail to compile.
		jdbc.query(
						STRENGTH_SQL,
						params(tenantId, membershipId, from, to),
						rs -> {
							byExercise
											.computeIfAbsent(rs.getString("exercise_name"), k -> new ArrayList<>())
											.add(
															new StrengthPoint(
																			rs.getObject("day", LocalDate.class),
																			scaled(rs.getBigDecimal("best_e1rm")),
																			rs.getLong("sets"),
																			scaled(rs.getBigDecimal("volume"))));
						});

		List<ExerciseStrength> result = new ArrayList<>(byExercise.size());
		byExercise.forEach(
						(name, points) -> {
							BigDecimal first = points.get(0).bestE1rmKg();
							BigDecimal latest = points.get(points.size() - 1).bestE1rmKg();
							BigDecimal best =
											points.stream()
											      .map(StrengthPoint::bestE1rmKg)
											      .filter(java.util.Objects::nonNull)
											      .max(Comparator.naturalOrder())
											      .orElse(null);

							result.add(
											new ExerciseStrength(
															name,
															first,
															latest,
															best,
															changePct(first, latest, points.size()),
															points));
						});

		// Most-trained first: the lifts the programme is built around should lead, not whichever
		// exercise happens to sort first alphabetically.
		result.sort(
						Comparator.comparingLong(
										(ExerciseStrength e) ->
														e.points().stream().mapToLong(StrengthPoint::sets).sum())
										.reversed()
										.thenComparing(ExerciseStrength::exerciseName));
		return result;
	}

	private static MapSqlParameterSource params(
					UUID tenantId, UUID membershipId, LocalDate from, LocalDate to) {
		return new MapSqlParameterSource()
						.addValue("tenantId", tenantId)
						.addValue("membershipId", membershipId)
						.addValue("fromDate", from)
						.addValue("toDate", to);
	}

	/** A membership that exists within the tenant. {@code clientName} may still be null. */
	public record MembershipRef(String membershipId, String clientName) {}
}
