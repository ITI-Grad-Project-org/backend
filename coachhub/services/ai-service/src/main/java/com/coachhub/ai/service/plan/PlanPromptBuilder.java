package com.coachhub.ai.service.plan;

import com.coachhub.ai.rabbitmq.payload.AiPlanRequestedPayload;
import com.coachhub.ai.rabbitmq.payload.PlanCandidates;
import com.coachhub.ai.rabbitmq.payload.PlanContext;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.StringJoiner;

/**
 * Turns one {@code ai.plan.requested} into the prompt that produces a plan.
 *
 * <p>The shape of the answer is not argued for here — that is the {@link PlanResponseSchema}'s job,
 * and repeating it in prose only gives the model two sources to disagree with. What this adds is
 * everything a schema cannot express: who the client is, what they cannot do, and the handful of
 * rules whose violation would make the plan unsavable.
 */
@Component
public class PlanPromptBuilder {

	/** Longest coach note carried into a prompt. */
	private static final int MAX_NOTE_LENGTH = 2_000;

	public String build(AiPlanRequestedPayload request) {
		StringBuilder sb = new StringBuilder(4_096);
		PlanContext context = request.context();

		sb.append(request.isTraining()
										? "You are an experienced strength and conditioning coach writing a training programme for one client.\n"
										: "You are an experienced sports nutritionist writing a nutrition plan for one client.\n")
		  .append("You are writing for the coach, who will review your proposal before the client ever sees it.\n\n");

		appendClient(sb, context);
		appendMeasurements(sb, context);
		appendHistory(sb, context);
		appendBrief(sb, request, context);
		appendRules(sb, request);

		if (request.isTraining()) {
			appendExercises(sb, request.candidates());
		} else {
			appendMeals(sb, request.candidates());
			appendFoods(sb, request.candidates());
		}

		return sb.toString();
	}

	private void appendClient(StringBuilder sb, PlanContext context) {
		sb.append("=== Client ===\n");

		PlanContext.ClientProfile client = context == null ? null : context.client();
		if (client != null) {
			StringJoiner line = new StringJoiner(" | ");
			addIfPresent(line, "Age", client.ageYears(), "years");
			addIfPresent(line, "Gender", client.gender(), null);
			addIfPresent(line, "Height", client.heightCm(), "cm");
			addIfPresent(line, "Weight", client.weightKg(), "kg");
			if (line.length() > 0) {
				sb.append(line).append('\n');
			}
		}

		PlanContext.IntakeProfile intake = context == null ? null : context.intake();
		if (intake == null) {
			// Say so rather than leaving a gap the model fills with assumptions.
			sb.append("No intake questionnaire on file — assume a general beginner and say so in the description.\n\n");
			return;
		}

		StringJoiner profile = new StringJoiner(" | ");
		addIfPresent(profile, "Goal", intake.goal(), null);
		addIfPresent(profile, "Experience", intake.trainingExperience(), null);
		addIfPresent(profile, "Activity level", intake.activityLevel(), null);
		if (profile.length() > 0) {
			sb.append(profile).append('\n');
		}

		appendList(sb, "Focus areas", intake.focusAreas());
		appendList(sb, "Preferred styles", intake.trainingStyles());
		appendList(sb, "Equipment available", intake.availableEquipment());
		appendList(sb, "Dietary preferences", intake.dietaryPreferences());
		appendList(sb, "Allergies", intake.allergies());
		appendList(sb, "Medical conditions", intake.medicalConditions());
		appendList(sb, "Injuries", intake.injuries());
		appendNote(sb, "Client notes", intake.notes());
		sb.append('\n');
	}

	private void appendMeasurements(StringBuilder sb, PlanContext context) {
		List<PlanContext.MeasurementPoint> points =
						context == null ? List.of() : context.measurements();
		if (points.isEmpty()) {
			return;
		}

		sb.append("=== Recent measurements (newest first) ===\n");
		for (PlanContext.MeasurementPoint point : points) {
			StringJoiner line = new StringJoiner(", ");
			addIfPresent(line, "weight", point.weightKg(), "kg");
			addIfPresent(line, "body fat", point.bodyFatPct(), "%");
			addIfPresent(line, "waist", point.waistCm(), "cm");
			addIfPresent(line, "chest", point.chestCm(), "cm");
			addIfPresent(line, "hips", point.hipsCm(), "cm");
			addIfPresent(line, "arm", point.armCm(), "cm");
			addIfPresent(line, "thigh", point.thighCm(), "cm");
			if (line.length() > 0) {
				sb.append(point.measuredAt()).append(": ").append(line).append('\n');
			}
		}
		sb.append('\n');
	}

	/**
	 * What has happened since the last plan.
	 *
	 * This is the difference between designing for the client who filled in an intake form six
	 * months ago and designing for the one who has been training since. A knee mentioned three weeks
	 * running should change the programme — without this section the model has no way to know it was
	 * ever mentioned once.
	 */
	private void appendHistory(StringBuilder sb, PlanContext context) {
		PlanContext.TrainingHistory history = context == null ? null : context.history();
		if (history == null || history.isEmpty()) {
			return;
		}

		sb.append("=== How training has actually been going (newest first) ===\n");

		for (PlanContext.CheckinNote note : history.checkins()) {
			StringJoiner line = new StringJoiner(" | ");
			addText(line, "client", note.clientNotes());
			addText(line, "coach", note.coachFeedback());
			if (note.metrics() != null && !note.metrics().isEmpty()) {
				StringJoiner metrics = new StringJoiner(", ");
				note.metrics().forEach((key, value) -> metrics.add(key + " " + number(value)));
				line.add(metrics.toString());
			}
			if (line.length() > 0) {
				sb.append("check-in ").append(note.date()).append(" — ").append(line).append('\n');
			}
		}

		for (PlanContext.SessionNote note : history.sessions()) {
			StringJoiner line = new StringJoiner(", ");
			if (note.overallRpe() != null) {
				line.add("RPE " + note.overallRpe());
			}
			if (note.durationMinutes() != null) {
				line.add(note.durationMinutes() + " min");
			}
			// Only worth saying when it is false; "finished" is the unremarkable case.
			if (Boolean.FALSE.equals(note.completed())) {
				line.add("not finished");
			}
			addText(line, null, note.clientNotes());
			if (line.length() > 0) {
				sb.append("session ").append(note.date()).append(" — ").append(line).append('\n');
			}
		}

		sb.append('\n');
	}

	private void addText(StringJoiner joiner, String label, String value) {
		if (value == null || value.isBlank()) {
			return;
		}
		String trimmed = value.strip();
		if (trimmed.length() > MAX_NOTE_LENGTH) {
			trimmed = trimmed.substring(0, MAX_NOTE_LENGTH);
		}
		joiner.add(label == null ? "\"" + trimmed + "\"" : label + ": " + trimmed);
	}

	private void appendBrief(StringBuilder sb, AiPlanRequestedPayload request, PlanContext context) {
		PlanContext.Constraints constraints = context == null ? null : context.constraints();
		Integer weeks = constraints == null ? null : constraints.durationWeeks();
		Integer days = constraints == null ? null : constraints.daysPerWeek();
		String goal = constraints == null ? null : constraints.goal();

		sb.append("=== The brief ===\n");
		if (goal != null) {
			sb.append("Goal for this plan: ").append(goal).append('\n');
		}

		if (request.isTraining()) {
			sb.append("Design ONE week of training");
			if (days != null) {
				sb.append(" with exactly ").append(days).append(" training day(s) and ")
				  .append(7 - days).append(" rest day(s)");
			}
			sb.append(".\n");
		} else {
			sb.append("Design ONE week of eating, all seven days.\n");
		}

		if (weeks != null) {
			sb.append("It will be repeated for ").append(weeks)
			  .append(" weeks, so the progression rule you give must still make sense in week ")
			  .append(weeks).append(".\n");
		}

		appendNote(sb, "The coach adds", context == null ? null : context.coachNotes());
		sb.append('\n');
	}

	private void appendRules(StringBuilder sb, AiPlanRequestedPayload request) {
		sb.append("=== Rules ===\n");
		if (request.isTraining()) {
			sb.append("""
							1. Every exerciseId MUST be copied exactly from the library below. You may not invent an \
							exercise, rename one, or use an id that is not listed — the plan is rejected if you do.
							2. The library is already filtered to equipment this client actually has. Everything in it \
							is usable; nothing outside it is.
							3. Cover all 7 days. A day with isRestDay true has an empty exercises array; a day with \
							isRestDay false has at least one exercise.
							4. Prescribe intensity as RPE or RIR, never as a weight in kilograms — you do not know what \
							this client can lift.
							5. A set prescribes EITHER a rep range (repsMin, optionally repsMax) OR durationSeconds, \
							never both, unless setType is amrap, to_failure or drop_set.
							6. Work around every injury and medical condition listed above. If that rules out an \
							obvious choice, say so in coachNotes on the exercise you used instead.
							7. Act on the training history if there is one. Something the client has raised more \
							than once is a pattern, not a one-off: change the plan rather than repeating it, and \
							say what you changed in the description. Sessions consistently at RPE 9-10 mean the \
							last plan was too hard; sessions left unfinished usually mean it was too long.
							""");
		} else {
			sb.append("""
							1. Every sourceMealId MUST be copied exactly from the meal library below. You may not \
							invent a meal or use an id that is not listed — the plan is rejected if you do.
							2. The meal library is already filtered against this client's allergies. The food list is \
							reference only: it tells you what a meal contains, and you may not build a meal from it.
							3. Cover all 7 days, and use the servings multiplier to hit the daily targets rather than \
							repeating the same meal at a token portion.
							4. Respect every dietary preference listed above. Nothing may contain a listed allergen.
							5. Set the daily targets yourself from the client's body, activity level and goal, and \
							explain the reasoning in one sentence of the description.
							6. Act on the training history if there is one. What the client says about hunger, \
							energy and adherence matters more than the arithmetic — a plan they did not follow \
							is worth less than a smaller change they will.
							""");
		}
		sb.append('\n');
	}

	private void appendExercises(StringBuilder sb, PlanCandidates candidates) {
		List<PlanCandidates.ExerciseCandidate> exercises = candidates.exercises();
		sb.append("=== Exercise library (").append(exercises.size()).append(") ===\n")
		  .append("id | name | category | primary muscle | secondary | equipment\n");
		for (PlanCandidates.ExerciseCandidate exercise : exercises) {
			sb.append(exercise.id()).append(" | ")
			  .append(exercise.name()).append(" | ")
			  .append(exercise.category()).append(" | ")
			  .append(exercise.primaryMuscle()).append(" | ")
			  .append(joinOrDash(exercise.secondaryMuscles())).append(" | ")
			  .append(joinOrDash(exercise.equipment()))
			  .append('\n');
		}
	}

	private void appendMeals(StringBuilder sb, PlanCandidates candidates) {
		List<PlanCandidates.MealCandidate> meals = candidates.meals();
		sb.append("=== Meal library (").append(meals.size()).append(") ===\n")
		  .append("id | name | kcal | protein g | carbs g | fat g | fibre g | tags | allergens\n");
		for (PlanCandidates.MealCandidate item : meals) {
			sb.append(item.id()).append(" | ")
			  .append(item.name()).append(" | ")
			  .append(number(item.calories())).append(" | ")
			  .append(number(item.proteinG())).append(" | ")
			  .append(number(item.carbsG())).append(" | ")
			  .append(number(item.fatG())).append(" | ")
			  .append(number(item.fiberG())).append(" | ")
			  .append(joinOrDash(item.dietaryTags())).append(" | ")
			  .append(joinOrDash(item.allergens()))
			  .append('\n');
		}
		sb.append('\n');
	}

	private void appendFoods(StringBuilder sb, PlanCandidates candidates) {
		List<PlanCandidates.FoodCandidate> foods = candidates.foods();
		if (foods.isEmpty()) {
			return;
		}

		sb.append("=== Food reference (").append(foods.size())
		  .append(") — for understanding meals, NOT for building them ===\n")
		  .append("name | per serving | kcal | protein g | carbs g | fat g\n");
		for (PlanCandidates.FoodCandidate item : foods) {
			sb.append(item.name());
			if (item.brand() != null && !item.brand().isBlank()) {
				sb.append(" (").append(item.brand()).append(')');
			}
			sb.append(" | ").append(number(item.servingSize())).append(' ').append(item.servingUnit())
			  .append(" | ").append(number(item.calories()))
			  .append(" | ").append(number(item.proteinG()))
			  .append(" | ").append(number(item.carbsG()))
			  .append(" | ").append(number(item.fatG()))
			  .append('\n');
		}
	}

	private void appendList(StringBuilder sb, String label, List<String> values) {
		if (values != null && !values.isEmpty()) {
			sb.append(label).append(": ").append(String.join(", ", values)).append('\n');
		}
	}

	private void appendNote(StringBuilder sb, String label, String note) {
		if (note == null || note.isBlank()) {
			return;
		}
		String trimmed = note.strip();
		if (trimmed.length() > MAX_NOTE_LENGTH) {
			trimmed = trimmed.substring(0, MAX_NOTE_LENGTH);
		}
		sb.append(label).append(": ").append(trimmed).append('\n');
	}

	private void addIfPresent(StringJoiner joiner, String label, Object value, String unit) {
		if (value == null) {
			return;
		}
		String rendered = value instanceof Number number ? number(number.doubleValue()) : value.toString();
		joiner.add(unit == null ? label + ": " + rendered : label + ": " + rendered + " " + unit);
	}

	private static String joinOrDash(List<String> values) {
		return values == null || values.isEmpty() ? "-" : String.join(",", values);
	}

	/** Drops the trailing {@code .0} — "80 kg" reads better than "80.0 kg" and costs a token less. */
	private static String number(Double value) {
		if (value == null) {
			return "-";
		}
		return value == Math.floor(value) && !value.isInfinite()
						? String.valueOf(value.longValue())
						: String.valueOf(value);
	}
}
