package com.coachhub.ai.service.plan;

import com.coachhub.ai.rabbitmq.payload.AiPlanRequestedPayload;
import com.coachhub.ai.rabbitmq.payload.PlanCandidates;
import com.coachhub.ai.rabbitmq.payload.PlanContext;
import com.coachhub.ai.rabbitmq.payload.PlanWarning;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Each case here corresponds to something core-api's schema would refuse on insert. If a check stops
 * mapping to a real constraint it should be deleted, not relaxed.
 */
class PlanValidatorTest {

	private static final String EXERCISE_ID = "11111111-1111-4111-8111-111111111111";
	private static final String MEAL_ID = "22222222-2222-4222-8222-222222222222";

	private final ObjectMapper mapper = new ObjectMapper();
	private PlanValidator validator;

	@BeforeEach
	void setUp() {
		validator = new PlanValidator();
	}

	private static AiPlanRequestedPayload request(String kind, Integer daysPerWeek) {
		PlanCandidates candidates =
						new PlanCandidates(
										List.of(new PlanCandidates.ExerciseCandidate(
														EXERCISE_ID, "Push-up", "strength", "chest", List.of(), List.of())),
										List.of(new PlanCandidates.MealCandidate(
														MEAL_ID, "Oat Bowl", List.of(), List.of(),
														400.0, 20.0, 60.0, 10.0, 8.0)),
										List.of());
		PlanContext context =
						new PlanContext(
										null, null, List.of(),
										new PlanContext.Constraints(4, daysPerWeek, "fat_loss"),
										new PlanContext.LibraryDescriptor(Map.of(), List.of(), List.of(), false),
										null);
		return new AiPlanRequestedPayload(
						"req-1", "suggestion-1", "membership-1", "coach-1", kind, context, candidates);
	}

	private JsonNode parse(String json) throws JsonProcessingException {
		return mapper.readTree(json);
	}

	private List<String> codes(List<PlanWarning> warnings) {
		return warnings.stream().map(PlanWarning::code).toList();
	}

	// ── Training ───────────────────────────────────────────────────────────────

	@Nested
	class Training {

		/** A day that is well-formed, so each test below can break exactly one thing. */
		private String day(int dayNumber, String exercises) {
			return """
							{"dayNumber":%d,"name":"Session","isRestDay":false,"notes":null,"exercises":[%s]}
							""".formatted(dayNumber, exercises);
		}

		private String restDay(int dayNumber) {
			return """
							{"dayNumber":%d,"name":null,"isRestDay":true,"notes":null,"exercises":[]}
							""".formatted(dayNumber);
		}

		private String exercise(String id, int position, String sets) {
			return """
							{"exerciseId":"%s","position":%d,"restSeconds":90,"tempo":null,
							 "supersetGroup":null,"coachNotes":null,"sets":[%s]}
							""".formatted(id, position, sets);
		}

		private String set(int number) {
			return """
							{"setNumber":%d,"setType":"working","repsMin":8,"repsMax":12,
							 "durationSeconds":null,"intensityType":"rpe","intensityValue":7}
							""".formatted(number);
		}

		private String plan(String... days) {
			return """
							{"name":"Plan","description":"d","difficulty":"beginner",
							 "progression":{"strategy":"linear_load","note":"n"},
							 "week":{"days":[%s]}}
							""".formatted(String.join(",", days));
		}

		private String validWeek() {
			return plan(
							day(1, exercise(EXERCISE_ID, 1, set(1))),
							restDay(2), restDay(3), restDay(4),
							restDay(5), restDay(6), restDay(7));
		}

		@Test
		@DisplayName("a well-formed week produces no warnings at all")
		void cleanPlan() throws Exception {
			List<PlanWarning> warnings = validator.validate(parse(validWeek()), request("training", 1));

			assertThat(warnings).isEmpty();
		}

		@Test
		@DisplayName("an exercise id outside the offered library is the failure that matters most")
		void unknownExercise() throws Exception {
			String json = plan(
							day(1, exercise("99999999-9999-4999-8999-999999999999", 1, set(1))),
							restDay(2), restDay(3), restDay(4), restDay(5), restDay(6), restDay(7));

			List<PlanWarning> warnings = validator.validate(parse(json), request("training", 1));

			assertThat(codes(warnings)).containsExactly("unknown_exercise");
			assertThat(warnings.getFirst().isError()).isTrue();
			assertThat(warnings.getFirst().path()).isEqualTo("week.days[0].exercises[0].exerciseId");
		}

		@Test
		@DisplayName("a rest day cannot carry exercises, and a training day cannot be empty")
		void dayShape() throws Exception {
			String restWithWork =
							"""
											{"dayNumber":1,"name":null,"isRestDay":true,"notes":null,"exercises":[%s]}
											""".formatted(exercise(EXERCISE_ID, 1, set(1)));
			String emptyTraining =
							"""
											{"dayNumber":2,"name":"Session","isRestDay":false,"notes":null,"exercises":[]}
											""";

			List<PlanWarning> warnings =
							validator.validate(parse(plan(restWithWork, emptyTraining)), request("training", null));

			assertThat(codes(warnings))
							.containsExactly("rest_day_has_exercises", "empty_training_day");
		}

		@Test
		@DisplayName("day numbers stay inside 1-7 and appear once each")
		void dayNumbers() throws Exception {
			String json = plan(
							day(1, exercise(EXERCISE_ID, 1, set(1))),
							day(1, exercise(EXERCISE_ID, 1, set(1))),
							day(9, exercise(EXERCISE_ID, 1, set(1))));

			List<PlanWarning> warnings = validator.validate(parse(json), request("training", null));

			assertThat(codes(warnings)).containsExactly("duplicate_day", "invalid_day_number");
		}

		@Test
		@DisplayName("positions are unique within a day")
		void duplicatePosition() throws Exception {
			String json = plan(day(1,
							exercise(EXERCISE_ID, 1, set(1)) + "," + exercise(EXERCISE_ID, 1, set(1))));

			List<PlanWarning> warnings = validator.validate(parse(json), request("training", null));

			assertThat(codes(warnings)).contains("duplicate_position");
		}

		@Test
		@DisplayName("a set prescribes reps or a duration, never both")
		void ambiguousSet() throws Exception {
			String bad = """
							{"setNumber":1,"setType":"working","repsMin":8,"repsMax":null,
							 "durationSeconds":60,"intensityType":null,"intensityValue":null}
							""";

			List<PlanWarning> warnings =
							validator.validate(parse(plan(day(1, exercise(EXERCISE_ID, 1, bad)))),
											request("training", null));

			assertThat(codes(warnings)).containsExactly("ambiguous_set");
		}

		@Test
		@DisplayName("a working set that prescribes nothing is rejected")
		void emptySet() throws Exception {
			String bad = """
							{"setNumber":1,"setType":"working","repsMin":null,"repsMax":null,
							 "durationSeconds":null,"intensityType":null,"intensityValue":null}
							""";

			List<PlanWarning> warnings =
							validator.validate(parse(plan(day(1, exercise(EXERCISE_ID, 1, bad)))),
											request("training", null));

			assertThat(codes(warnings)).containsExactly("empty_set");
		}

		@Test
		@DisplayName("an AMRAP set needs no rep target — that is what AMRAP means")
		void amrapNeedsNoTarget() throws Exception {
			String amrap = """
							{"setNumber":1,"setType":"amrap","repsMin":null,"repsMax":null,
							 "durationSeconds":null,"intensityType":null,"intensityValue":null}
							""";

			List<PlanWarning> warnings =
							validator.validate(parse(plan(day(1, exercise(EXERCISE_ID, 1, amrap)))),
											request("training", null));

			assertThat(warnings).isEmpty();
		}

		@Test
		@DisplayName("a rep ceiling without a floor mirrors ck_planned_sets_reps_max_requires_min")
		void repsMaxWithoutMin() throws Exception {
			String bad = """
							{"setNumber":1,"setType":"working","repsMin":null,"repsMax":12,
							 "durationSeconds":30,"intensityType":null,"intensityValue":null}
							""";

			List<PlanWarning> warnings =
							validator.validate(parse(plan(day(1, exercise(EXERCISE_ID, 1, bad)))),
											request("training", null));

			assertThat(codes(warnings)).containsExactly("reps_max_without_min");
		}

		@Test
		@DisplayName("intensity type and value are set together or not at all")
		void incompleteIntensity() throws Exception {
			String bad = """
							{"setNumber":1,"setType":"working","repsMin":8,"repsMax":null,
							 "durationSeconds":null,"intensityType":"rpe","intensityValue":null}
							""";

			List<PlanWarning> warnings =
							validator.validate(parse(plan(day(1, exercise(EXERCISE_ID, 1, bad)))),
											request("training", null));

			assertThat(codes(warnings)).containsExactly("incomplete_intensity");
		}

		@Test
		@DisplayName("an exercise with no sets is rejected")
		void emptyExercise() throws Exception {
			List<PlanWarning> warnings =
							validator.validate(parse(plan(day(1, exercise(EXERCISE_ID, 1, "")))),
											request("training", null));

			assertThat(codes(warnings)).containsExactly("empty_exercise");
		}

		@Test
		@DisplayName("the wrong number of training days is a warning, not a rejection")
		void daysPerWeekMismatch() throws Exception {
			List<PlanWarning> warnings = validator.validate(parse(validWeek()), request("training", 4));

			assertThat(warnings).hasSize(1);
			assertThat(warnings.getFirst().code()).isEqualTo("days_per_week_mismatch");
			assertThat(warnings.getFirst().isError()).isFalse();
			assertThat(warnings.getFirst().message()).contains("4").contains("1");
		}
	}

	// ── Nutrition ──────────────────────────────────────────────────────────────

	@Nested
	class Nutrition {

		private String day(int dayNumber, String meals) {
			return """
							{"dayNumber":%d,"isFlexibleDay":false,"notes":null,"meals":[%s]}
							""".formatted(dayNumber, meals);
		}

		private String meal(String id, int position, double servings) {
			return """
							{"sourceMealId":"%s","slot":"breakfast","position":%d,"servings":%s,
							 "suggestedTime":"08:00","coachNotes":null}
							""".formatted(id, position, servings);
		}

		private String plan(String... days) {
			return """
							{"name":"Plan","description":"d",
							 "targets":{"calories":2000,"proteinG":150,"carbsG":200,"fatG":60,
							            "fiberG":30,"waterMl":3000},
							 "progression":{"strategy":"linear_calories","note":"n"},
							 "week":{"days":[%s]}}
							""".formatted(String.join(",", days));
		}

		@Test
		@DisplayName("a well-formed week produces no warnings")
		void cleanPlan() throws Exception {
			List<PlanWarning> warnings =
							validator.validate(parse(plan(day(1, meal(MEAL_ID, 1, 1)))), request("nutrition", null));

			assertThat(warnings).isEmpty();
		}

		@Test
		@DisplayName("a meal id outside the offered library is rejected")
		void unknownMeal() throws Exception {
			List<PlanWarning> warnings =
							validator.validate(
											parse(plan(day(1, meal("99999999-9999-4999-8999-999999999999", 1, 1)))),
											request("nutrition", null));

			assertThat(codes(warnings)).containsExactly("unknown_meal");
		}

		@Test
		@DisplayName("a portion multiplier of zero would produce a meal with no food in it")
		void invalidServings() throws Exception {
			List<PlanWarning> warnings =
							validator.validate(parse(plan(day(1, meal(MEAL_ID, 1, 0)))), request("nutrition", null));

			assertThat(codes(warnings)).containsExactly("invalid_servings");
		}

		@Test
		@DisplayName("a day with no meals is fine only when it is a flexible day")
		void emptyDay() throws Exception {
			String flexible = """
							{"dayNumber":1,"isFlexibleDay":true,"notes":null,"meals":[]}
							""";
			String fixed = """
							{"dayNumber":2,"isFlexibleDay":false,"notes":null,"meals":[]}
							""";

			List<PlanWarning> warnings =
							validator.validate(parse(plan(flexible, fixed)), request("nutrition", null));

			assertThat(codes(warnings)).containsExactly("empty_day");
		}
	}

	// ── Shape ──────────────────────────────────────────────────────────────────

	@Test
	@DisplayName("a response that is not an object at all is reported, not thrown")
	void notAnObject() throws Exception {
		List<PlanWarning> warnings = validator.validate(parse("[]"), request("training", null));

		assertThat(codes(warnings)).containsExactly("malformed_plan");
	}

	@Test
	@DisplayName("a plan with no days is reported once rather than cascading")
	void noDays() throws Exception {
		List<PlanWarning> warnings =
						validator.validate(parse("{\"week\":{\"days\":[]}}"), request("training", null));

		assertThat(codes(warnings)).containsExactly("missing_week");
	}
}
