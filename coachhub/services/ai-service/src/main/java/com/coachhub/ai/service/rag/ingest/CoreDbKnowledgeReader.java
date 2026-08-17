package com.coachhub.ai.service.rag.ingest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

@Component
public class CoreDbKnowledgeReader {

	static final String SOURCE_EXERCISE = "exercise-library";
	static final String SOURCE_PROGRAM = "program-template";
	static final String SOURCE_MEAL = "meal-library";
	static final String SOURCE_FOOD = "food-library";
	static final String SOURCE_NUTRITION = "nutrition-plan";
	static final String SOURCE_INTAKE = "client-profile";

	private static final Logger log = LoggerFactory.getLogger(CoreDbKnowledgeReader.class);

	private static final String EXERCISES_SQL =
					"""
									SELECT e.tenant_id,
									       e.name,
									       e.category::text          AS category,
									       e.primary_muscle::text    AS primary_muscle,
									       e.secondary_muscles::text[] AS secondary_muscles,
									       e.equipment::text[]       AS equipment,
									       e.instruction_steps
									FROM exercises e
									WHERE e.is_active
									""";

	private static final String PROGRAMS_SQL =
					"""
									SELECT p.tenant_id,
									       p.name,
									       p.description,
									       p.goal::text       AS goal,
									       p.difficulty::text AS difficulty,
									       p.duration_weeks,
									       (SELECT count(*) FROM program_weeks w WHERE w.program_id = p.id)
									           AS week_count,
									       (SELECT count(*)
									          FROM program_weeks w
									          JOIN program_days d ON d.program_week_id = w.id
									         WHERE w.program_id = p.id AND NOT d.is_rest_day)
									           AS training_days,
									       (SELECT array_agg(DISTINCT pe.exercise_name)
									          FROM program_weeks w
									          JOIN program_days d      ON d.program_week_id = w.id
									          JOIN planned_exercises pe ON pe.program_day_id = d.id
									         WHERE w.program_id = p.id)
									           AS exercise_names
									FROM programs p
									WHERE p.program_type = 'template'
									  AND NOT p.is_archived
									""";

	private static final String MEALS_SQL =
					"""
									SELECT m.tenant_id,
									       m.name,
									       m.description,
									       m.prep_notes,
									       m.dietary_tags::text[] AS dietary_tags,
									       m.allergens
									FROM meals m
									WHERE m.is_active
									""";

	private static final String FOODS_SQL =
					"""
									SELECT f.tenant_id,
									       f.name,
									       f.brand,
									       f.serving_size,
									       f.serving_unit::text   AS serving_unit,
									       f.calories,
									       f.protein_g,
									       f.carbs_g,
									       f.fat_g,
									       f.fiber_g,
									       f.dietary_tags::text[] AS dietary_tags,
									       f.allergens
									FROM foods f
									WHERE f.is_active
									""";

	private static final String NUTRITION_SQL =
					"""
									SELECT n.tenant_id,
									       n.name,
									       n.description,
									       n.goal::text AS goal,
									       n.duration_weeks,
									       n.target_calories,
									       n.target_protein_g,
									       n.target_carbs_g,
									       n.target_fat_g,
									       n.target_fiber_g
									FROM nutrition_plans n
									WHERE n.plan_type = 'template'
									  AND NOT n.is_archived
									""";

	/**
	 * The one genuinely sensitive source here — it carries injuries, medical conditions and
	 * allergies. It earns its place because "what should I program for Sara" is the question the
	 * assistant exists to answer and it cannot be answered without this, but it is also the reason
	 * retrieval is tenant-filtered rather than filtered "later".
	 */
	private static final String INTAKES_SQL =
					"""
									SELECT ci.tenant_id,
									       nullif(trim(coalesce(c.first_name, '') || ' ' ||
									                   coalesce(c.last_name, '')), '') AS client_name,
									       ci.goal::text                AS goal,
									       ci.training_experience::text AS training_experience,
									       ci.activity_level::text      AS activity_level,
									       ci.training_days_per_week,
									       ci.focus_areas::text[]          AS focus_areas,
									       ci.training_styles::text[]      AS training_styles,
									       ci.available_equipment::text[]  AS available_equipment,
									       ci.dietary_preferences::text[]  AS dietary_preferences,
									       ci.allergies,
									       ci.medical_conditions,
									       ci.injuries,
									       ci.notes
									FROM client_intakes ci
									JOIN memberships m ON m.id = ci.membership_id
									LEFT JOIN clients c ON c.id = m.client_id
									WHERE m.deleted_at IS NULL
									""";

	private final NamedParameterJdbcTemplate jdbc;

	public CoreDbKnowledgeReader(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	// ── rendering ───────────────────────────────────────────────────────────────
	// Package-private and static so each one can be asserted directly in a test
	// without a database. The exact wording is the retrievable surface of the
	// corpus, so it is worth pinning down.

	static String renderExercise(
					String name,
					String category,
					String primaryMuscle,
					String[] secondaryMuscles,
					String[] equipment,
					String[] instructionSteps) {
		StringBuilder sb = new StringBuilder();
		sb.append("Exercise: ").append(name).append(".\n");
		Phrasing.appendIfPresent(sb, "Type", Phrasing.humanize(category));
		Phrasing.appendIfPresent(sb, "Primarily works", Phrasing.humanize(primaryMuscle));
		Phrasing.appendIfPresent(sb, "Also works", Phrasing.humanizeAll(secondaryMuscles));

		String kit = Phrasing.humanizeAll(equipment);
		// "No equipment needed" is worth stating rather than omitting: bodyweight is
		// something coaches search for, and an absent field cannot be matched.
		sb.append("Equipment needed: ").append(kit.isBlank() ? "none (bodyweight)" : kit).append(".\n");

		Phrasing.appendIfPresent(sb, "How to perform", Phrasing.numbered(instructionSteps));
		return sb.toString().trim();
	}

	static String renderProgram(
					String name,
					String description,
					String goal,
					String difficulty,
					Integer durationWeeks,
					Integer weekCount,
					Integer trainingDays,
					String[] exerciseNames) {
		StringBuilder sb = new StringBuilder();
		sb.append("Training program template: ").append(name).append(".\n");
		Phrasing.appendIfPresent(sb, "Description", description);
		Phrasing.appendIfPresent(sb, "Goal", Phrasing.humanize(goal));
		Phrasing.appendIfPresent(sb, "Difficulty", Phrasing.humanize(difficulty));
		if (durationWeeks != null) {
			sb.append("Runs for ").append(durationWeeks).append(" weeks");
			if (trainingDays != null && weekCount != null && weekCount > 0) {
				sb.append(", about ").append(Math.round((double) trainingDays / weekCount))
				  .append(" training days per week");
			}
			sb.append(".\n");
		}
		Phrasing.appendIfPresent(sb, "Exercises used", Phrasing.joinRaw(exerciseNames));
		return sb.toString().trim();
	}

	static String renderMeal(
					String name, String description, String prepNotes, String[] dietaryTags, String[] allergens) {
		StringBuilder sb = new StringBuilder();
		sb.append("Meal: ").append(name).append(".\n");
		Phrasing.appendIfPresent(sb, "Description", description);
		Phrasing.appendIfPresent(sb, "Suits diets", Phrasing.humanizeAll(dietaryTags));
		Phrasing.appendIfPresent(sb, "Contains allergens", Phrasing.joinRaw(allergens));
		Phrasing.appendIfPresent(sb, "Preparation", prepNotes);
		return sb.toString().trim();
	}

	static String renderFood(
					String name,
					String brand,
					BigDecimal servingSize,
					String servingUnit,
					BigDecimal calories,
					BigDecimal protein,
					BigDecimal carbs,
					BigDecimal fat,
					BigDecimal fiber,
					String[] dietaryTags,
					String[] allergens) {
		StringBuilder sb = new StringBuilder();
		sb.append("Food: ").append(name);
		if (brand != null && !brand.isBlank()) {
			sb.append(" (").append(brand.trim()).append(')');
		}
		sb.append(".\n");

		String size = Phrasing.number(servingSize);
		String unit = Phrasing.humanize(servingUnit);
		if (!size.isBlank()) {
			sb.append("Per ").append(size);
			if (!unit.isBlank()) {
				sb.append(' ').append(unit);
			}
			sb.append(": ");
		} else {
			sb.append("Per serving: ");
		}

		List<String> macros = new ArrayList<>();
		if (calories != null) {
			macros.add(Phrasing.number(calories) + " calories");
		}
		if (protein != null) {
			macros.add(Phrasing.number(protein) + " g protein");
		}
		if (carbs != null) {
			macros.add(Phrasing.number(carbs) + " g carbohydrate");
		}
		if (fat != null) {
			macros.add(Phrasing.number(fat) + " g fat");
		}
		if (fiber != null) {
			macros.add(Phrasing.number(fiber) + " g fibre");
		}
		sb.append(macros.isEmpty() ? "macros not recorded" : String.join(", ", macros)).append(".\n");

		Phrasing.appendIfPresent(sb, "Suits diets", Phrasing.humanizeAll(dietaryTags));
		Phrasing.appendIfPresent(sb, "Contains allergens", Phrasing.joinRaw(allergens));
		return sb.toString().trim();
	}

	static String renderNutritionPlan(
					String name,
					String description,
					String goal,
					Integer durationWeeks,
					Integer calories,
					Integer protein,
					Integer carbs,
					Integer fat,
					Integer fiber) {
		StringBuilder sb = new StringBuilder();
		sb.append("Nutrition plan template: ").append(name).append(".\n");
		Phrasing.appendIfPresent(sb, "Description", description);
		Phrasing.appendIfPresent(sb, "Goal", Phrasing.humanize(goal));
		if (durationWeeks != null) {
			sb.append("Runs for ").append(durationWeeks).append(" weeks.\n");
		}

		List<String> targets = new ArrayList<>();
		if (calories != null) {
			targets.add(calories + " calories");
		}
		if (protein != null) {
			targets.add(protein + " g protein");
		}
		if (carbs != null) {
			targets.add(carbs + " g carbohydrate");
		}
		if (fat != null) {
			targets.add(fat + " g fat");
		}
		if (fiber != null) {
			targets.add(fiber + " g fibre");
		}
		if (!targets.isEmpty()) {
			sb.append("Daily targets: ").append(String.join(", ", targets)).append(".\n");
		}
		return sb.toString().trim();
	}

	static String renderIntake(
					String clientName,
					String goal,
					String trainingExperience,
					String activityLevel,
					Integer daysPerWeek,
					String[] focusAreas,
					String[] trainingStyles,
					String[] equipment,
					String[] dietaryPreferences,
					String[] allergies,
					String[] medicalConditions,
					String[] injuries,
					String notes) {
		String who = (clientName == null || clientName.isBlank()) ? "An unnamed client" : clientName;
		StringBuilder sb = new StringBuilder();
		sb.append("Client profile: ").append(who).append(".\n");
		Phrasing.appendIfPresent(sb, "Goal", Phrasing.humanize(goal));
		Phrasing.appendIfPresent(sb, "Training experience", Phrasing.humanize(trainingExperience));
		Phrasing.appendIfPresent(sb, "Activity level", Phrasing.humanize(activityLevel));
		if (daysPerWeek != null) {
			sb.append("Can train ").append(daysPerWeek).append(" days per week.\n");
		}
		Phrasing.appendIfPresent(sb, "Focus areas", Phrasing.humanizeAll(focusAreas));
		Phrasing.appendIfPresent(sb, "Preferred training styles", Phrasing.humanizeAll(trainingStyles));
		Phrasing.appendIfPresent(sb, "Equipment available", Phrasing.humanizeAll(equipment));
		Phrasing.appendIfPresent(
						sb, "Dietary preferences", Phrasing.humanizeAll(dietaryPreferences));
		Phrasing.appendIfPresent(sb, "Allergies", Phrasing.joinRaw(allergies));
		// Phrased as a constraint rather than a label so it lands near questions about
		// what a client should avoid.
		Phrasing.appendIfPresent(
						sb, "Medical conditions to work around", Phrasing.joinRaw(medicalConditions));
		Phrasing.appendIfPresent(sb, "Injuries to work around", Phrasing.joinRaw(injuries));
		Phrasing.appendIfPresent(sb, "Coach notes", notes);
		return sb.toString().trim();
	}

	// ── reading ─────────────────────────────────────────────────────────────────

	private static String mapExercise(ResultSet rs) throws SQLException {
		return renderExercise(
						rs.getString("name"),
						rs.getString("category"),
						rs.getString("primary_muscle"),
						array(rs, "secondary_muscles"),
						array(rs, "equipment"),
						array(rs, "instruction_steps"));
	}

	private static String mapProgram(ResultSet rs) throws SQLException {
		return renderProgram(
						rs.getString("name"),
						rs.getString("description"),
						rs.getString("goal"),
						rs.getString("difficulty"),
						integer(rs, "duration_weeks"),
						integer(rs, "week_count"),
						integer(rs, "training_days"),
						array(rs, "exercise_names"));
	}

	private static String mapMeal(ResultSet rs) throws SQLException {
		return renderMeal(
						rs.getString("name"),
						rs.getString("description"),
						rs.getString("prep_notes"),
						array(rs, "dietary_tags"),
						array(rs, "allergens"));
	}

	// ── row mappers ─────────────────────────────────────────────────────────────

	private static String mapFood(ResultSet rs) throws SQLException {
		return renderFood(
						rs.getString("name"),
						rs.getString("brand"),
						rs.getBigDecimal("serving_size"),
						rs.getString("serving_unit"),
						rs.getBigDecimal("calories"),
						rs.getBigDecimal("protein_g"),
						rs.getBigDecimal("carbs_g"),
						rs.getBigDecimal("fat_g"),
						rs.getBigDecimal("fiber_g"),
						array(rs, "dietary_tags"),
						array(rs, "allergens"));
	}

	private static String mapNutritionPlan(ResultSet rs) throws SQLException {
		return renderNutritionPlan(
						rs.getString("name"),
						rs.getString("description"),
						rs.getString("goal"),
						integer(rs, "duration_weeks"),
						integer(rs, "target_calories"),
						integer(rs, "target_protein_g"),
						integer(rs, "target_carbs_g"),
						integer(rs, "target_fat_g"),
						integer(rs, "target_fiber_g"));
	}

	private static String mapIntake(ResultSet rs) throws SQLException {
		return renderIntake(
						rs.getString("client_name"),
						rs.getString("goal"),
						rs.getString("training_experience"),
						rs.getString("activity_level"),
						integer(rs, "training_days_per_week"),
						array(rs, "focus_areas"),
						array(rs, "training_styles"),
						array(rs, "available_equipment"),
						array(rs, "dietary_preferences"),
						array(rs, "allergies"),
						array(rs, "medical_conditions"),
						array(rs, "injuries"),
						rs.getString("notes"));
	}

	/**
	 * Postgres arrays arrive as {@link Array}; null and empty are the same thing to us.
	 */
	private static String[] array(ResultSet rs, String column) throws SQLException {
		Array array = rs.getArray(column);
		if (array == null) {
			return new String[0];
		}
		Object raw = array.getArray();
		if (raw instanceof String[] values) {
			return values;
		}
		return new String[0];
	}

	/**
	 * {@code getInt} maps SQL NULL to 0, which would report "runs for 0 weeks" as a fact.
	 */
	private static Integer integer(ResultSet rs, String column) throws SQLException {
		int value = rs.getInt(column);
		return rs.wasNull() ? null : value;
	}

	/**
	 * Every chunk core_db can offer, across every tenant.
	 *
	 * <p>Sources are read independently and a failure in one is logged and skipped rather than
	 * aborting the run: an unreadable meals table should cost the assistant its meal knowledge, not
	 * its exercise library.
	 */
	public List<KnowledgeDocument> readAll() {
		List<KnowledgeDocument> docs = new ArrayList<>();
		docs.addAll(read(SOURCE_EXERCISE, EXERCISES_SQL, CoreDbKnowledgeReader::mapExercise));
		docs.addAll(read(SOURCE_PROGRAM, PROGRAMS_SQL, CoreDbKnowledgeReader::mapProgram));
		docs.addAll(read(SOURCE_MEAL, MEALS_SQL, CoreDbKnowledgeReader::mapMeal));
		docs.addAll(read(SOURCE_FOOD, FOODS_SQL, CoreDbKnowledgeReader::mapFood));
		docs.addAll(read(SOURCE_NUTRITION, NUTRITION_SQL, CoreDbKnowledgeReader::mapNutritionPlan));
		docs.addAll(read(SOURCE_INTAKE, INTAKES_SQL, CoreDbKnowledgeReader::mapIntake));
		return docs;
	}

	private List<KnowledgeDocument> read(String source, String sql, RowText rowText) {
		try {
			List<KnowledgeDocument> docs =
							jdbc.query(
											sql,
											(rs, rowNum) ->
															KnowledgeDocument.of(
																			rs.getString("tenant_id"),
																			source,
																			KnowledgeDocument.ORIGIN_CORE_DB,
																			rowText.apply(rs)));
			log.debug("read {} chunks from {}", docs.size(), source);
			return docs;
		} catch (Exception ex) {
			log.warn("skipping source {} — {}", source, ex.getMessage());
			return List.of();
		}
	}

	@FunctionalInterface
	private interface RowText {
		String apply(ResultSet rs) throws SQLException;
	}
}
