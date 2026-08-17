package com.coachhub.ai.service.plan;

import com.coachhub.ai.rabbitmq.payload.AiPlanRequestedPayload;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The {@code responseSchema} handed to Gemini for each kind of plan.
 *
 * <h2>One week, not twelve</h2>
 *
 * <p>Both schemas describe a single week plus a progression rule, never the whole program. A 12-week
 * plan generated week by week costs roughly eight times the output tokens, routinely truncates at
 * {@code maxOutputTokens}, and produces twelve weeks that drift instead of progressing. Expanding
 * one week by an explicit rule is arithmetic, and arithmetic belongs in code.
 *
 * <h2>What the model is not asked for</h2>
 *
 * <p>No exercise names, categories, muscles, media or instructions: core-api copies all of that from
 * the {@code exercises} row when the coach accepts, so asking for it invites the model to describe
 * an exercise differently from the library it came from.
 *
 * <p>No {@code weightKg} either. Nothing in the context says what this client can lift, so a number
 * in kilograms would be invented — and invented load is the one field in a training plan that can
 * actually hurt someone. Intensity is prescribed as RPE or RIR instead, which is what a coach
 * writing for an unfamiliar client would do.
 */
public final class PlanResponseSchema {

	private PlanResponseSchema() {}

	private static final List<String> DIFFICULTIES =
					List.of("beginner", "intermediate", "advanced");
	private static final List<String> SET_TYPES =
					List.of("working", "warmup", "drop_set", "amrap", "to_failure");
	private static final List<String> INTENSITY_TYPES = List.of("rpe", "rir", "percent_1rm");
	private static final List<String> MEAL_SLOTS =
					List.of("breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout");
	private static final List<String> PROGRESSION_STRATEGIES =
					List.of("linear_load", "linear_reps", "linear_sets", "linear_calories", "none");

	public static Map<String, Object> forKind(String kind) {
		return AiPlanRequestedPayload.TRAINING.equals(kind) ? training() : nutrition();
	}

	static Map<String, Object> training() {
		return object(
						entry("name", string("Program name a coach would recognise, at most 150 characters.")),
						entry("description", string("Two or three sentences on the approach and why it suits this client.")),
						entry("difficulty", enumOf("Overall difficulty.", DIFFICULTIES)),
						entry("progression", progression("How week 2 onwards differ from this one.")),
						entry("week", object(entry("days", array("Exactly one entry per day of the week, dayNumber 1 to 7.", trainingDay())))));
	}

	static Map<String, Object> nutrition() {
		return object(
						entry("name", string("Plan name a coach would recognise, at most 150 characters.")),
						entry("description", string("Two or three sentences on the approach and why it suits this client.")),
						entry("targets", targets()),
						entry("progression", progression("How later weeks adjust, e.g. a calorie change.")),
						entry("week", object(entry("days", array("Exactly one entry per day of the week, dayNumber 1 to 7.", nutritionDay())))));
	}

	private static Map<String, Object> progression(String description) {
		Map<String, Object> schema =
						object(
										entry("strategy", enumOf("How each week differs from the one before.", PROGRESSION_STRATEGIES)),
										entry("note", string("One sentence a coach can act on, e.g. 'add 2.5 kg to every working set each week'.")));
		schema.put("description", description);
		return schema;
	}

	private static Map<String, Object> targets() {
		return object(
						entry("calories", integer("Daily calorie target.")),
						entry("proteinG", integer("Daily protein target in grams.")),
						entry("carbsG", integer("Daily carbohydrate target in grams.")),
						entry("fatG", integer("Daily fat target in grams.")),
						entry("fiberG", nullable(integer("Daily fibre target in grams, or null."))),
						entry("waterMl", nullable(integer("Daily water target in millilitres, or null."))));
	}

	private static Map<String, Object> trainingDay() {
		return object(
						entry("dayNumber", integer("1 to 7. Every day appears exactly once.")),
						entry("name", nullable(string("Session name, e.g. 'Upper Push'. Null on a rest day."))),
						entry("isRestDay", bool("True for a rest day, which must have an empty exercises array.")),
						entry("notes", nullable(string("Anything the client should know about this session."))),
						entry("exercises", array("Ordered by position, starting at 1. Empty on a rest day.", trainingExercise())));
	}

	private static Map<String, Object> trainingExercise() {
		return object(
						entry("exerciseId", string("MUST be the id of one of the supplied library exercises, copied exactly.")),
						entry("position", integer("Order within the day, starting at 1 with no gaps.")),
						entry("restSeconds", integer("Rest between sets, in seconds.")),
						entry("tempo", nullable(string("Four values like '3-1-1-0' (eccentric-pause-concentric-pause), or null."))),
						entry("supersetGroup", nullable(integer("Exercises sharing a number are supersetted together, or null."))),
						entry("coachNotes", nullable(string("A cue or a caution for this exercise, or null."))),
						entry("sets", array("Ordered by setNumber, starting at 1.", trainingSet())));
	}

	private static Map<String, Object> trainingSet() {
		return object(
						entry("setNumber", integer("Order within the exercise, starting at 1 with no gaps.")),
						entry("setType", enumOf("Set type. Use 'working' unless there is a reason not to.", SET_TYPES)),
						entry("repsMin", nullable(integer("Lower end of the rep range. Null only for a timed set."))),
						entry("repsMax", nullable(integer("Upper end of the rep range, or null for a fixed number of reps."))),
						entry("durationSeconds", nullable(integer("For timed work such as a plank. Null when reps are prescribed — never set both."))),
						entry("intensityType", nullable(enumOf("How intensity is expressed, or null.", INTENSITY_TYPES))),
						entry("intensityValue", nullable(number("The intensity figure: RPE 1-10, RIR 0-10, or a percentage. Null when intensityType is null."))));
	}

	private static Map<String, Object> nutritionDay() {
		return object(
						entry("dayNumber", integer("1 to 7. Every day appears exactly once.")),
						entry("isFlexibleDay", bool("True when the client eats to the targets rather than to the listed meals.")),
						entry("notes", nullable(string("Anything the client should know about this day."))),
						entry("meals", array("Ordered by position, starting at 1.", plannedMeal())));
	}

	private static Map<String, Object> plannedMeal() {
		return object(
						entry("sourceMealId", string("MUST be the id of one of the supplied library meals, copied exactly.")),
						entry("slot", enumOf("Which meal of the day this is.", MEAL_SLOTS)),
						entry("position", integer("Order within the day, starting at 1 with no gaps.")),
						entry("servings", number("Portion multiplier applied to every ingredient, e.g. 1.5. Use 1 for a standard portion.")),
						entry("suggestedTime", nullable(string("24-hour HH:MM, or null."))),
						entry("coachNotes", nullable(string("A note about this meal, or null."))));
	}

	// ── Schema primitives ──────────────────────────────────────────────────────
	//
	// Gemini takes an OpenAPI subset: upper-case type names, and `propertyOrdering`
	// to fix the order fields are generated in — which matters, because a model
	// filling a long object does it more consistently when the order is pinned.
	// Every property is required and the optional ones are nullable, so the shape
	// that comes back is always the same and the validator has one case to handle
	// instead of two.

	private static Map.Entry<String, Map<String, Object>> entry(
					String name, Map<String, Object> schema) {
		return Map.entry(name, schema);
	}

	@SafeVarargs
	private static Map<String, Object> object(Map.Entry<String, Map<String, Object>>... fields) {
		Map<String, Object> properties = new LinkedHashMap<>();
		List<String> names = new java.util.ArrayList<>(fields.length);
		for (Map.Entry<String, Map<String, Object>> field : fields) {
			properties.put(field.getKey(), field.getValue());
			names.add(field.getKey());
		}

		Map<String, Object> schema = new LinkedHashMap<>();
		schema.put("type", "OBJECT");
		schema.put("properties", properties);
		schema.put("propertyOrdering", names);
		schema.put("required", names);
		return schema;
	}

	private static Map<String, Object> array(String description, Map<String, Object> items) {
		Map<String, Object> schema = new LinkedHashMap<>();
		schema.put("type", "ARRAY");
		schema.put("description", description);
		schema.put("items", items);
		return schema;
	}

	private static Map<String, Object> string(String description) {
		return scalar("STRING", description);
	}

	private static Map<String, Object> integer(String description) {
		return scalar("INTEGER", description);
	}

	private static Map<String, Object> number(String description) {
		return scalar("NUMBER", description);
	}

	private static Map<String, Object> bool(String description) {
		return scalar("BOOLEAN", description);
	}

	private static Map<String, Object> enumOf(String description, List<String> values) {
		Map<String, Object> schema = scalar("STRING", description);
		schema.put("enum", values);
		return schema;
	}

	private static Map<String, Object> scalar(String type, String description) {
		Map<String, Object> schema = new LinkedHashMap<>();
		schema.put("type", type);
		schema.put("description", description);
		return schema;
	}

	private static Map<String, Object> nullable(Map<String, Object> schema) {
		schema.put("nullable", true);
		return schema;
	}
}
