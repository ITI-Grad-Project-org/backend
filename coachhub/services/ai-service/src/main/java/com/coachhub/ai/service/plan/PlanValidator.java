package com.coachhub.ai.service.plan;

import com.coachhub.ai.rabbitmq.payload.AiPlanRequestedPayload;
import com.coachhub.ai.rabbitmq.payload.PlanCandidates;
import com.coachhub.ai.rabbitmq.payload.PlanWarning;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Checks a generated plan against the things core-api's schema would reject.
 *
 * <h2>Why here and not only in core-api</h2>
 *
 * <p>One check needs the candidate list — "is this id one of the ones we offered?" — and this
 * service is the only place that has it. core-api re-checks every id at acceptance anyway, against
 * the live library rather than a snapshot of it, because a coach may delete an exercise while the
 * suggestion sits waiting. Neither check replaces the other: this one tells the coach immediately
 * that the model went off-script, that one stops a stale plan being saved.
 *
 * <p>The severity split is deliberate and mechanical. {@code error} means a constraint would fail on
 * insert — a missing foreign key, a day number outside 1-7, a set that prescribes nothing. {@code
 * warning} means a coach might disagree. Nothing here guesses at programme quality; a validator
 * that starts having opinions about rep ranges is one that cries wolf.
 */
@Component
public class PlanValidator {

	/**
	 * A plan that has gone this wrong is not going to be salvaged by reading warning 51. The cap
	 * keeps one confused generation from producing a payload larger than the plan itself.
	 */
	private static final int MAX_WARNINGS = 50;

	private static final Set<String> SETS_WITHOUT_A_TARGET =
					Set.of("amrap", "to_failure", "drop_set");

	public List<PlanWarning> validate(JsonNode plan, AiPlanRequestedPayload request) {
		List<PlanWarning> warnings = new ArrayList<>();

		if (plan == null || !plan.isObject()) {
			warnings.add(PlanWarning.error("malformed_plan", "", "The model did not return a JSON object."));
			return warnings;
		}

		JsonNode days = plan.path("week").path("days");
		if (!days.isArray() || days.isEmpty()) {
			warnings.add(PlanWarning.error("missing_week", "week.days", "The plan contains no days."));
			return warnings;
		}

		// Hoisted out of the day loop: the same set answers every "is this id one of
		// the ones we offered?" in the plan.
		Set<String> known = request.isTraining()
						? idsOf(request.candidates().exercises(), PlanCandidates.ExerciseCandidate::id)
						: idsOf(request.candidates().meals(), PlanCandidates.MealCandidate::id);
		Set<Integer> seenDays = new HashSet<>();
		int trainingDays = 0;

		for (int i = 0; i < days.size(); i++) {
			JsonNode day = days.get(i);
			String path = "week.days[" + i + "]";

			int dayNumber = day.path("dayNumber").asInt(-1);
			if (dayNumber < 1 || dayNumber > 7) {
				add(warnings, PlanWarning.error("invalid_day_number", path + ".dayNumber",
								"Day number must be between 1 and 7, got " + dayNumber + "."));
			} else if (!seenDays.add(dayNumber)) {
				add(warnings, PlanWarning.error("duplicate_day", path + ".dayNumber",
								"Day " + dayNumber + " appears more than once."));
			}

			if (request.isTraining()) {
				if (!day.path("isRestDay").asBoolean(false)) {
					trainingDays++;
				}
				validateTrainingDay(warnings, day, path, known);
			} else {
				validateNutritionDay(warnings, day, path, known);
			}
		}

		if (request.isTraining()) {
			checkTrainingDayCount(warnings, request, trainingDays);
		}

		return warnings;
	}

	// ── Training ───────────────────────────────────────────────────────────────

	private void validateTrainingDay(
					List<PlanWarning> warnings, JsonNode day, String path, Set<String> known) {
		boolean isRestDay = day.path("isRestDay").asBoolean(false);
		JsonNode exercises = day.path("exercises");
		int count = exercises.isArray() ? exercises.size() : 0;

		if (isRestDay && count > 0) {
			add(warnings, PlanWarning.error("rest_day_has_exercises", path + ".exercises",
							"A rest day cannot prescribe exercises."));
			return;
		}
		if (!isRestDay && count == 0) {
			add(warnings, PlanWarning.error("empty_training_day", path + ".exercises",
							"A training day must prescribe at least one exercise."));
			return;
		}
		if (!exercises.isArray()) {
			return;
		}

		Set<Integer> positions = new HashSet<>();

		for (int i = 0; i < exercises.size(); i++) {
			JsonNode exercise = exercises.get(i);
			String exercisePath = path + ".exercises[" + i + "]";

			String exerciseId = exercise.path("exerciseId").asText(null);
			if (exerciseId == null || exerciseId.isBlank()) {
				add(warnings, PlanWarning.error("missing_exercise_id", exercisePath + ".exerciseId",
								"No exercise id was given."));
			} else if (!known.contains(exerciseId)) {
				// The single most likely way a generated plan fails to save.
				add(warnings, PlanWarning.error("unknown_exercise", exercisePath + ".exerciseId",
								"Exercise " + exerciseId + " is not in the library that was offered."));
			}

			checkPosition(warnings, exercise, exercisePath, positions);
			validateSets(warnings, exercise.path("sets"), exercisePath);
		}
	}

	private void validateSets(List<PlanWarning> warnings, JsonNode sets, String path) {
		if (!sets.isArray() || sets.isEmpty()) {
			add(warnings, PlanWarning.error("empty_exercise", path + ".sets",
							"An exercise must prescribe at least one set."));
			return;
		}

		Set<Integer> numbers = new HashSet<>();
		for (int i = 0; i < sets.size(); i++) {
			JsonNode set = sets.get(i);
			String setPath = path + ".sets[" + i + "]";

			int setNumber = set.path("setNumber").asInt(-1);
			if (setNumber < 1) {
				add(warnings, PlanWarning.error("invalid_set_number", setPath + ".setNumber",
								"Set numbers start at 1, got " + setNumber + "."));
			} else if (!numbers.add(setNumber)) {
				add(warnings, PlanWarning.error("duplicate_set_number", setPath + ".setNumber",
								"Set " + setNumber + " appears more than once."));
			}

			validateSetPrescription(warnings, set, setPath);
		}
	}

	/**
	 * Mirrors the three CHECK constraints on {@code planned_sets}: a set says what to do, it says it
	 * one way, and a rep ceiling needs a floor.
	 */
	private void validateSetPrescription(List<PlanWarning> warnings, JsonNode set, String path) {
		boolean hasReps = isNumber(set.path("repsMin"));
		boolean hasDuration = isNumber(set.path("durationSeconds"));
		String setType = set.path("setType").asText("working");

		if (hasReps && hasDuration) {
			add(warnings, PlanWarning.error("ambiguous_set", path,
							"A set prescribes either reps or a duration, not both."));
		} else if (!hasReps && !hasDuration && !SETS_WITHOUT_A_TARGET.contains(setType)) {
			add(warnings, PlanWarning.error("empty_set", path,
							"A '" + setType + "' set must prescribe reps or a duration."));
		}

		if (isNumber(set.path("repsMax")) && !hasReps) {
			add(warnings, PlanWarning.error("reps_max_without_min", path + ".repsMax",
							"A rep ceiling needs a floor."));
		}

		if (set.hasNonNull("intensityType") != isNumber(set.path("intensityValue"))) {
			add(warnings, PlanWarning.error("incomplete_intensity", path,
							"intensityType and intensityValue are set together or not at all."));
		}
	}

	private void checkTrainingDayCount(
					List<PlanWarning> warnings, AiPlanRequestedPayload request, int trainingDays) {
		Integer asked = request.context() == null || request.context().constraints() == null
						? null
						: request.context().constraints().daysPerWeek();
		if (asked != null && asked != trainingDays) {
			// Not an error: the plan saves perfectly well, the coach simply asked for
			// something else and deserves to be told before they accept it.
			add(warnings, PlanWarning.warning("days_per_week_mismatch", "week.days",
							"Asked for " + asked + " training day(s), got " + trainingDays + "."));
		}
	}

	// ── Nutrition ──────────────────────────────────────────────────────────────

	private void validateNutritionDay(
					List<PlanWarning> warnings, JsonNode day, String path, Set<String> known) {
		JsonNode meals = day.path("meals");
		boolean isFlexible = day.path("isFlexibleDay").asBoolean(false);

		if (!meals.isArray() || meals.isEmpty()) {
			if (!isFlexible) {
				add(warnings, PlanWarning.error("empty_day", path + ".meals",
								"A day must prescribe at least one meal unless it is a flexible day."));
			}
			return;
		}

		Set<Integer> positions = new HashSet<>();

		for (int i = 0; i < meals.size(); i++) {
			JsonNode meal = meals.get(i);
			String mealPath = path + ".meals[" + i + "]";

			String mealId = meal.path("sourceMealId").asText(null);
			if (mealId == null || mealId.isBlank()) {
				add(warnings, PlanWarning.error("missing_meal_id", mealPath + ".sourceMealId",
								"No meal id was given."));
			} else if (!known.contains(mealId)) {
				add(warnings, PlanWarning.error("unknown_meal", mealPath + ".sourceMealId",
								"Meal " + mealId + " is not in the library that was offered."));
			}

			checkPosition(warnings, meal, mealPath, positions);

			JsonNode servings = meal.path("servings");
			if (isNumber(servings) && servings.asDouble() <= 0) {
				add(warnings, PlanWarning.error("invalid_servings", mealPath + ".servings",
								"A portion multiplier must be greater than zero."));
			}
		}
	}

	// ── Shared ─────────────────────────────────────────────────────────────────

	private void checkPosition(
					List<PlanWarning> warnings, JsonNode node, String path, Set<Integer> seen) {
		int position = node.path("position").asInt(-1);
		if (position < 1) {
			add(warnings, PlanWarning.error("invalid_position", path + ".position",
							"Positions start at 1, got " + position + "."));
		} else if (!seen.add(position)) {
			add(warnings, PlanWarning.error("duplicate_position", path + ".position",
							"Position " + position + " is used twice in the same list."));
		}
	}

	private static <T> Set<String> idsOf(List<T> candidates, Function<T, String> id) {
		return candidates.stream().map(id).collect(Collectors.toSet());
	}

	private static boolean isNumber(JsonNode node) {
		return node != null && node.isNumber();
	}

	private static void add(List<PlanWarning> warnings, PlanWarning warning) {
		if (warnings.size() < MAX_WARNINGS) {
			warnings.add(warning);
		}
	}
}
