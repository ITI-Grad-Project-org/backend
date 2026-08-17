package com.coachhub.ai.service.plan;

import com.coachhub.ai.rabbitmq.payload.AiPlanRequestedPayload;
import com.coachhub.ai.rabbitmq.payload.PlanCandidates;
import com.coachhub.ai.rabbitmq.payload.PlanContext;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The prompt is the only place the model learns what it must not do. These check the parts whose
 * absence would produce a plausible-looking plan that cannot be saved or should never be trained.
 */
class PlanPromptBuilderTest {

	private static final String EXERCISE_ID = "11111111-1111-4111-8111-111111111111";
	private static final String MEAL_ID = "22222222-2222-4222-8222-222222222222";

	private final PlanPromptBuilder builder = new PlanPromptBuilder();

	private static PlanContext.IntakeProfile intake() {
		return new PlanContext.IntakeProfile(
						"fat_loss", "moderately_active", "beginner", 3,
						List.of("weight_loss"), List.of("hypertrophy"),
						List.of("dumbbells"), List.of("halal"),
						List.of("peanuts"), List.of("asthma"),
						List.of("left shoulder impingement"),
						"Prefers early morning sessions.");
	}

	private static PlanContext.TrainingHistory history() {
		return new PlanContext.TrainingHistory(
						List.of(new PlanContext.CheckinNote(
										"2026-08-10",
										"Knee felt tight on squats again this week.",
										"Swap to goblet squats for now.",
										Map.of("sleepHours", 6.5))),
						List.of(new PlanContext.SessionNote("2026-08-12", "Last set felt heavy.", 9, 62, true),
										new PlanContext.SessionNote("2026-08-09", null, 8, null, false)));
	}

	private static AiPlanRequestedPayload request(
					String kind, PlanContext.IntakeProfile intake, PlanCandidates candidates, String coachNotes) {
		return request(kind, intake, candidates, coachNotes, PlanContext.TrainingHistory.empty());
	}

	private static AiPlanRequestedPayload request(
					String kind,
					PlanContext.IntakeProfile intake,
					PlanCandidates candidates,
					String coachNotes,
					PlanContext.TrainingHistory history) {
		PlanContext context =
						new PlanContext(
										new PlanContext.ClientProfile(30, "male", 180.0, 79.4),
										intake,
										List.of(new PlanContext.MeasurementPoint(
														"2026-08-10", 79.4, 22.0, null, 84.0, null, null, null)),
										history,
										new PlanContext.Constraints(4, 3, "fat_loss"),
										new PlanContext.LibraryDescriptor(Map.of(), List.of("dumbbells"), List.of(), false),
										coachNotes);
		return new AiPlanRequestedPayload(
						"req-1", "suggestion-1", "membership-1", "coach-1", kind, context, candidates);
	}

	private static PlanCandidates trainingLibrary() {
		return new PlanCandidates(
						List.of(new PlanCandidates.ExerciseCandidate(
										EXERCISE_ID, "Goblet Squat", "strength", "quads",
										List.of("glutes"), List.of("dumbbells"))),
						List.of(), List.of());
	}

	private static PlanCandidates nutritionLibrary() {
		return new PlanCandidates(
						List.of(),
						List.of(new PlanCandidates.MealCandidate(
										MEAL_ID, "Oat Bowl", List.of("halal"), List.of(),
										400.0, 20.0, 60.0, 10.0, 8.0)),
						List.of(new PlanCandidates.FoodCandidate(
										"food-1", "Rolled Oats", null, 100.0, "g",
										380.0, 13.0, 67.0, 7.0, 10.0, List.of(), List.of())));
	}

	@Test
	@DisplayName("every candidate id appears verbatim, because the model has to copy one")
	void carriesExerciseIds() {
		String prompt = builder.build(request("training", intake(), trainingLibrary(), null));

		assertThat(prompt).contains(EXERCISE_ID).contains("Goblet Squat");
	}

	@Test
	@DisplayName("injuries and medical conditions reach the prompt")
	void carriesContraindications() {
		String prompt = builder.build(request("training", intake(), trainingLibrary(), null));

		assertThat(prompt)
						.contains("left shoulder impingement")
						.contains("asthma")
						.contains("Work around every injury");
	}

	@Test
	@DisplayName("the model is told not to prescribe a weight it cannot know")
	void forbidsInventedLoad() {
		String prompt = builder.build(request("training", intake(), trainingLibrary(), null));

		assertThat(prompt).contains("never as a weight in kilograms");
	}

	@Test
	@DisplayName("the brief asks for one week, and says how many weeks it will be repeated for")
	void statesTheBrief() {
		String prompt = builder.build(request("training", intake(), trainingLibrary(), null));

		assertThat(prompt)
						.contains("Design ONE week")
						.contains("exactly 3 training day(s) and 4 rest day(s)")
						.contains("repeated for 4 weeks");
	}

	@Test
	@DisplayName("a coach note is passed through")
	void carriesCoachNotes() {
		String prompt =
						builder.build(request("training", intake(), trainingLibrary(), "Keep pressing light."));

		assertThat(prompt).contains("Keep pressing light.");
	}

	@Test
	@DisplayName("a missing intake is stated, not left as a silent gap")
	void handlesMissingIntake() {
		String prompt = builder.build(request("training", null, trainingLibrary(), null));

		assertThat(prompt).contains("No intake questionnaire on file");
	}

	@Test
	@DisplayName("measurements are rendered without a spurious decimal point")
	void rendersNumbersCleanly() {
		String prompt = builder.build(request("training", intake(), trainingLibrary(), null));

		assertThat(prompt).contains("Height: 180 cm").doesNotContain("180.0 cm");
		assertThat(prompt).contains("weight: 79.4 kg");
	}

	@Test
	@DisplayName("the nutrition prompt offers meals and marks foods as reference only")
	void nutritionLibraries() {
		String prompt = builder.build(request("nutrition", intake(), nutritionLibrary(), null));

		assertThat(prompt)
						.contains(MEAL_ID)
						.contains("Meal library (1)")
						.contains("NOT for building them")
						.contains("Rolled Oats");
		// Foods cannot be assembled into a meal: source_meal_id is NOT NULL.
		assertThat(prompt).contains("you may not build a meal from it");
	}

	@Test
	@DisplayName("a training prompt says nothing about meals")
	void keepsKindsApart() {
		String prompt = builder.build(request("training", intake(), trainingLibrary(), null));

		assertThat(prompt).doesNotContain("Meal library").doesNotContain("sourceMealId");
	}

	@Test
	@DisplayName("the client's name is never in the prompt, because it is never in the payload")
	void carriesNoIdentity() {
		String prompt = builder.build(request("training", intake(), trainingLibrary(), null));

		assertThat(prompt).doesNotContain("@").doesNotContainIgnoringCase("name:");
	}

	// ── Training history ──────────────────────────────────────────────────────
	//
	// The point of the whole feature: a plan written months after the intake
	// should react to what has happened since, not repeat the first plan.

	@Test
	@DisplayName("check-ins reach the prompt in the client's own words")
	void carriesCheckins() {
		String prompt = builder.build(
						request("training", intake(), trainingLibrary(), null, history()));

		assertThat(prompt)
						.contains("How training has actually been going")
						.contains("Knee felt tight on squats again this week.")
						.contains("Swap to goblet squats for now.")
						.contains("sleepHours 6.5");
	}

	@Test
	@DisplayName("session RPE and unfinished sessions reach the prompt")
	void carriesSessions() {
		String prompt = builder.build(
						request("training", intake(), trainingLibrary(), null, history()));

		assertThat(prompt)
						.contains("RPE 9")
						.contains("62 min")
						.contains("Last set felt heavy.")
						// The 2026-08-09 session was never completed — that is the signal.
						.contains("not finished");
	}

	@Test
	@DisplayName("the model is told to act on a repeated complaint, not just shown it")
	void instructsTheModelToReact() {
		String prompt = builder.build(
						request("training", intake(), trainingLibrary(), null, history()));

		assertThat(prompt).contains("Act on the training history");
	}

	@Test
	@DisplayName("the nutrition prompt gets the history too")
	void nutritionCarriesHistory() {
		String prompt = builder.build(
						request("nutrition", intake(), nutritionLibrary(), null, history()));

		assertThat(prompt)
						.contains("Knee felt tight on squats again this week.")
						.contains("Act on the training history");
	}

	@Test
	@DisplayName("a client with no history gets no empty section")
	void omitsAnEmptyHistory() {
		String prompt = builder.build(request("training", intake(), trainingLibrary(), null));

		assertThat(prompt).doesNotContain("How training has actually been going");
	}
}

