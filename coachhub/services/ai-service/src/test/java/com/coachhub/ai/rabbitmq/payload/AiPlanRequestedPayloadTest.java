package com.coachhub.ai.rabbitmq.payload;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The seam between the two services, tested against what core-api actually sends.
 *
 * <p>The JSON below is a real {@code ai.plan.requested} payload, taken from a live request rather
 * than written to match these records. That is the point: nothing but a test like this notices when
 * a field is renamed on the other side of a message broker — the message still arrives, the field
 * just silently becomes null, and the model quietly designs for a client whose injuries it was never
 * told about.
 */
class AiPlanRequestedPayloadTest {

	private final ObjectMapper mapper =
					new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

	private static final String CORE_API_PAYLOAD =
					"""
					{
					  "requestId": "a2bae646-74e9-4500-8ec6-e0a70450e88e",
					  "suggestionId": "d2d349d4-4f6a-44c9-836d-f34380b5bf4d",
					  "membershipId": "d0000001-0000-4000-8000-000000000001",
					  "coachId": "aaaaaaaa-0000-4000-8000-000000000001",
					  "kind": "training",
					  "context": {
					    "client": {"ageYears": null, "gender": null, "heightCm": null, "weightKg": null},
					    "intake": {
					      "goal": "fat_loss",
					      "activityLevel": null,
					      "trainingExperience": "beginner",
					      "trainingDaysPerWeek": 3,
					      "focusAreas": ["strength", "weight_loss"],
					      "trainingStyles": ["strength", "hypertrophy"],
					      "availableEquipment": ["dumbbells", "resistance_bands"],
					      "dietaryPreferences": ["halal"],
					      "allergies": ["peanuts"],
					      "medicalConditions": ["asthma"],
					      "injuries": ["left shoulder impingement"],
					      "notes": "Prefers early morning sessions before work."
					    },
					    "measurements": [],
					    "constraints": {"durationWeeks": 4, "daysPerWeek": 3, "goal": "fat_loss"},
					    "library": {
					      "counts": {"exercises": 1},
					      "equipment": ["dumbbells", "resistance_bands", "none"],
					      "excludedAllergens": [],
					      "truncated": false
					    },
					    "coachNotes": null
					  },
					  "candidates": {
					    "exercises": [{
					      "id": "b0000001-0000-4000-8000-000000000002",
					      "name": "Bodyweight Pull-up",
					      "category": "strength",
					      "primaryMuscle": "back",
					      "secondaryMuscles": ["biceps"],
					      "equipment": ["none"]
					    }],
					    "meals": [],
					    "foods": []
					  }
					}
					""";

	@Test
	@DisplayName("a real core-api payload deserializes with nothing lost")
	void deserializesACoreApiPayload() throws Exception {
		JsonNode raw = mapper.readTree(CORE_API_PAYLOAD);

		AiPlanRequestedPayload payload = mapper.convertValue(raw, AiPlanRequestedPayload.class);

		assertThat(payload.requestId()).isEqualTo("a2bae646-74e9-4500-8ec6-e0a70450e88e");
		assertThat(payload.suggestionId()).isEqualTo("d2d349d4-4f6a-44c9-836d-f34380b5bf4d");
		assertThat(payload.isTraining()).isTrue();

		PlanContext.IntakeProfile intake = payload.context().intake();
		assertThat(intake.goal()).isEqualTo("fat_loss");
		assertThat(intake.trainingDaysPerWeek()).isEqualTo(3);
		// The fields whose silent loss would be worst: the model would design around
		// an injury it was never told about.
		assertThat(intake.injuries()).containsExactly("left shoulder impingement");
		assertThat(intake.medicalConditions()).containsExactly("asthma");
		assertThat(intake.allergies()).containsExactly("peanuts");
		assertThat(intake.availableEquipment()).containsExactly("dumbbells", "resistance_bands");

		assertThat(payload.context().constraints().durationWeeks()).isEqualTo(4);
		assertThat(payload.context().library().counts()).containsEntry("exercises", 1);
		assertThat(payload.context().library().excludedAllergens()).isEmpty();

		assertThat(payload.candidates().exercises()).hasSize(1);
		PlanCandidates.ExerciseCandidate exercise = payload.candidates().exercises().getFirst();
		assertThat(exercise.id()).isEqualTo("b0000001-0000-4000-8000-000000000002");
		assertThat(exercise.name()).isEqualTo("Bodyweight Pull-up");
		assertThat(exercise.secondaryMuscles()).containsExactly("biceps");
	}

	@Test
	@DisplayName("a client with no intake on file is null, not a crash")
	void toleratesAMissingIntake() throws Exception {
		String json = CORE_API_PAYLOAD.replaceFirst("(?s)\"intake\": \\{.*?\\n {4}\\},", "\"intake\": null,");

		AiPlanRequestedPayload payload =
						mapper.convertValue(mapper.readTree(json), AiPlanRequestedPayload.class);

		assertThat(payload.context().intake()).isNull();
		assertThat(payload.candidates().exercises()).hasSize(1);
	}

	@Test
	@DisplayName("an unknown enum value arrives as a string rather than failing the message")
	void toleratesUnknownEnumValues() throws Exception {
		// core-api can add a training style without redeploying this service. The
		// value belongs in the prompt as-is; refusing the message would dead-letter
		// a perfectly good request over a vocabulary change.
		String json = CORE_API_PAYLOAD.replace("\"hypertrophy\"", "\"powerbuilding\"");

		AiPlanRequestedPayload payload =
						mapper.convertValue(mapper.readTree(json), AiPlanRequestedPayload.class);

		assertThat(payload.context().intake().trainingStyles()).contains("powerbuilding");
	}

	@Test
	@DisplayName("missing lists become empty ones, so nothing downstream has to null-check")
	void defaultsMissingLists() throws Exception {
		String json =
						"""
						{"requestId":"r","suggestionId":"s","membershipId":"m","coachId":"c","kind":"nutrition",
						 "context":{"client":null,"intake":null,"measurements":null,"constraints":null,
						            "library":null,"coachNotes":null},
						 "candidates":{"exercises":null,"meals":null,"foods":null}}
						""";

		AiPlanRequestedPayload payload =
						mapper.convertValue(mapper.readTree(json), AiPlanRequestedPayload.class);

		assertThat(payload.context().measurements()).isEmpty();
		assertThat(payload.candidates().exercises()).isEmpty();
		assertThat(payload.candidates().meals()).isEmpty();
		assertThat(payload.candidates().foods()).isEmpty();
		assertThat(payload.isTraining()).isFalse();
	}
}
