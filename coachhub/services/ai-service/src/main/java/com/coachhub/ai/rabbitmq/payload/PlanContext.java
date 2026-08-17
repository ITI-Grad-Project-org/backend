package com.coachhub.ai.rabbitmq.payload;

import java.util.List;
import java.util.Map;

/**
 * The client as core-api described them, straight off {@code ai.plan.requested}.
 *
 * <p>Everything is a plain string or number rather than an enum on purpose. These are core-api's
 * enums, and a coach adding a training style there should not stop this service deserializing a
 * message — an unrecognised value belongs in the prompt as-is, not in a {@code
 * ValueInstantiationException}.
 *
 * <p>There is no name and no email in here, and that is core-api's decision, not an oversight:
 * designing a program needs a body and a history, not an identity.
 */
public record PlanContext(
				ClientProfile client,
				IntakeProfile intake,
				List<MeasurementPoint> measurements,
				TrainingHistory history,
				Constraints constraints,
				LibraryDescriptor library,
				String coachNotes) {

	public PlanContext {
		measurements = measurements == null ? List.of() : List.copyOf(measurements);
		history = history == null ? TrainingHistory.empty() : history;
	}

	public record ClientProfile(
					Integer ageYears, String gender, Double heightCm, Double weightKg) {}

	public record IntakeProfile(
					String goal,
					String activityLevel,
					String trainingExperience,
					Integer trainingDaysPerWeek,
					List<String> focusAreas,
					List<String> trainingStyles,
					List<String> availableEquipment,
					List<String> dietaryPreferences,
					List<String> allergies,
					List<String> medicalConditions,
					List<String> injuries,
					String notes) {

		public IntakeProfile {
			focusAreas = nullSafe(focusAreas);
			trainingStyles = nullSafe(trainingStyles);
			availableEquipment = nullSafe(availableEquipment);
			dietaryPreferences = nullSafe(dietaryPreferences);
			allergies = nullSafe(allergies);
			medicalConditions = nullSafe(medicalConditions);
			injuries = nullSafe(injuries);
		}
	}

	public record MeasurementPoint(
					String measuredAt,
					Double weightKg,
					Double bodyFatPct,
					Double chestCm,
					Double waistCm,
					Double hipsCm,
					Double armCm,
					Double thighCm) {}

	/**
	 * What has happened since the last plan: the client's own words and how the
	 * sessions actually went.
	 *
	 * The intake says what the client wanted at signup. This says whether it has
	 * been working — a knee mentioned three weeks running, a fortnight of missed
	 * sessions, an RPE of 9 on everything. A plan written months later that
	 * ignores all of it is just the first plan again.
	 */
	public record TrainingHistory(List<CheckinNote> checkins, List<SessionNote> sessions) {

		public TrainingHistory {
			checkins = checkins == null ? List.of() : List.copyOf(checkins);
			sessions = sessions == null ? List.of() : List.copyOf(sessions);
		}

		public static TrainingHistory empty() {
			return new TrainingHistory(List.of(), List.of());
		}

		public boolean isEmpty() {
			return checkins.isEmpty() && sessions.isEmpty();
		}
	}

	public record CheckinNote(
					String date, String clientNotes, String coachFeedback, Map<String, Double> metrics) {}

	public record SessionNote(
					String date,
					String clientNotes,
					Integer overallRpe,
					Integer durationMinutes,
					Boolean completed) {}

	/** What the coach asked for, after core-api applied the intake's own defaults. */
	public record Constraints(Integer durationWeeks, Integer daysPerWeek, String goal) {}

	/** How big the candidate pool was and what narrowed it. */
	public record LibraryDescriptor(
					Map<String, Integer> counts,
					List<String> equipment,
					List<String> excludedAllergens,
					Boolean truncated) {

		public LibraryDescriptor {
			counts = counts == null ? Map.of() : Map.copyOf(counts);
			equipment = nullSafe(equipment);
			excludedAllergens = nullSafe(excludedAllergens);
		}
	}

	private static List<String> nullSafe(List<String> values) {
		return values == null ? List.of() : List.copyOf(values);
	}
}
