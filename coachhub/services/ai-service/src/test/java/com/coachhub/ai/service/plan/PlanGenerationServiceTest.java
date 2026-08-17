package com.coachhub.ai.service.plan;

import com.coachhub.ai.domain.AiDocument;
import com.coachhub.ai.domain.AiRequestRepository;
import com.coachhub.ai.rabbitmq.EventPublisher;
import com.coachhub.ai.rabbitmq.payload.AiPlanCompletedPayload;
import com.coachhub.ai.rabbitmq.payload.AiPlanRequestedPayload;
import com.coachhub.ai.rabbitmq.payload.PlanCandidates;
import com.coachhub.ai.rabbitmq.payload.PlanContext;
import com.coachhub.ai.rabbitmq.payload.PlanWarning;
import com.coachhub.ai.service.client.GeminiClient;
import com.coachhub.ai.service.client.GeminiProperties;
import com.coachhub.ai.service.client.GeminiResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers what this service is actually responsible for: calling the model once per request, turning
 * whatever comes back into a completion event, and never letting a failure end in silence.
 */
class PlanGenerationServiceTest {

	private static final String EXERCISE_ID = "11111111-1111-4111-8111-111111111111";
	private static final String TENANT = "tenant-1";

	private static final GeminiProperties PROPERTIES =
					new GeminiProperties(null, "key", "gemini-2.5-flash", null, null, null, null, null);

	private static final String VALID_PLAN =
					"""
					{"name":"Dumbbell Fat Loss","description":"d","difficulty":"beginner",
					 "progression":{"strategy":"linear_load","note":"add 2.5 kg weekly"},
					 "week":{"days":[
					   {"dayNumber":1,"name":"Full Body","isRestDay":false,"notes":null,"exercises":[
					     {"exerciseId":"%s","position":1,"restSeconds":90,"tempo":null,
					      "supersetGroup":null,"coachNotes":null,"sets":[
					        {"setNumber":1,"setType":"working","repsMin":8,"repsMax":12,
					         "durationSeconds":null,"intensityType":"rpe","intensityValue":7}]}]},
					   {"dayNumber":2,"name":null,"isRestDay":true,"notes":null,"exercises":[]},
					   {"dayNumber":3,"name":null,"isRestDay":true,"notes":null,"exercises":[]},
					   {"dayNumber":4,"name":null,"isRestDay":true,"notes":null,"exercises":[]},
					   {"dayNumber":5,"name":null,"isRestDay":true,"notes":null,"exercises":[]},
					   {"dayNumber":6,"name":null,"isRestDay":true,"notes":null,"exercises":[]},
					   {"dayNumber":7,"name":null,"isRestDay":true,"notes":null,"exercises":[]}]}}
					""".formatted(EXERCISE_ID);

	private GeminiClient gemini;
	private AiRequestRepository repository;
	private EventPublisher publisher;
	private PlanGenerationService service;

	@BeforeEach
	void setUp() {
		gemini = mock(GeminiClient.class);
		repository = mock(AiRequestRepository.class);
		publisher = mock(EventPublisher.class);

		when(repository.findByRequestId(anyString())).thenReturn(Optional.empty());
		when(repository.save(any(AiDocument.class))).thenAnswer(call -> call.getArgument(0));
		when(publisher.publish(anyString(), any(), anyString(), anyString())).thenReturn("corr-1");

		service = new PlanGenerationService(
						gemini, PROPERTIES, new PlanPromptBuilder(), new PlanValidator(),
						repository, publisher, new ObjectMapper());
	}

	private static AiPlanRequestedPayload request(String kind, Integer daysPerWeek) {
		PlanCandidates candidates =
						new PlanCandidates(
										List.of(new PlanCandidates.ExerciseCandidate(
														EXERCISE_ID, "Goblet Squat", "strength", "quads",
														List.of(), List.of("dumbbells"))),
										List.of(new PlanCandidates.MealCandidate(
														"meal-1", "Oat Bowl", List.of(), List.of(),
														400.0, 20.0, 60.0, 10.0, 8.0)),
										List.of());
		PlanContext context =
						new PlanContext(
										new PlanContext.ClientProfile(30, "male", 180.0, 80.0),
										null, List.of(),
										new PlanContext.Constraints(4, daysPerWeek, "fat_loss"),
										new PlanContext.LibraryDescriptor(Map.of(), List.of(), List.of(), false),
										null);
		return new AiPlanRequestedPayload(
						"req-1", "suggestion-1", "membership-1", "coach-1", kind, context, candidates);
	}

	private static GeminiResult result(String text) {
		return new GeminiResult(text, "STOP", 1_200, 3_400, 800, 5_400);
	}

	private AiPlanCompletedPayload publishedPayload() {
		ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
		verify(publisher).publish(eq("ai.plan.completed"), payload.capture(), eq(TENANT), eq("corr-in"));
		return (AiPlanCompletedPayload) payload.getValue();
	}

	@Test
	@DisplayName("a clean plan is forwarded with its usage figures and no warnings")
	void publishesSucceeded() {
		when(gemini.generateJson(anyString(), any())).thenReturn(result(VALID_PLAN));

		service.process(request("training", 1), TENANT, "corr-in");

		AiPlanCompletedPayload published = publishedPayload();
		assertThat(published.status()).isEqualTo("succeeded");
		assertThat(published.suggestionId()).isEqualTo("suggestion-1");
		assertThat(published.warnings()).isEmpty();
		assertThat(published.error()).isNull();
		assertThat(published.plan().path("name").asText()).isEqualTo("Dumbbell Fat Loss");
		assertThat(published.modelMeta().model()).isEqualTo("gemini-2.5-flash");
		assertThat(published.modelMeta().promptTokens()).isEqualTo(1_200);
		assertThat(published.modelMeta().totalTokens()).isEqualTo(5_400);
		assertThat(published.modelMeta().latencyMs()).isNotNull();
	}

	@Test
	@DisplayName("a plan that breaks a constraint still ships — with the warning attached")
	void carriesWarnings() {
		String offScript = VALID_PLAN.replace(EXERCISE_ID, "99999999-9999-4999-8999-999999999999");
		when(gemini.generateJson(anyString(), any())).thenReturn(result(offScript));

		service.process(request("training", 1), TENANT, "corr-in");

		AiPlanCompletedPayload published = publishedPayload();
		// Still 'succeeded': a plan came back. Whether it is usable is core-api's
		// call, and the warning is what it decides on.
		assertThat(published.status()).isEqualTo("succeeded");
		assertThat(published.warnings()).extracting(PlanWarning::code).containsExactly("unknown_exercise");
	}

	@Test
	@DisplayName("the request is never generated twice, however often the event is delivered")
	void skipsWorkAlreadyDone() {
		AiDocument done = AiDocument.planRequested(request("training", 1), TENANT, "prompt");
		done.markSucceeded(VALID_PLAN);
		when(repository.findByRequestId("req-1")).thenReturn(Optional.of(done));

		service.process(request("training", 1), TENANT, "corr-in");

		verify(gemini, never()).generateJson(anyString(), any());
		verify(publisher, never()).publish(anyString(), any(), anyString(), anyString());
	}

	@Test
	@DisplayName("a failed generation reports why, rather than leaving the coach waiting")
	void publishesFailure() {
		when(gemini.generateJson(anyString(), any()))
						.thenThrow(new IllegalStateException("Gemini blocked the prompt (blockReason=SAFETY)"));

		service.process(request("training", 1), TENANT, "corr-in");

		AiPlanCompletedPayload published = publishedPayload();
		assertThat(published.status()).isEqualTo("failed");
		assertThat(published.plan()).isNull();
		assertThat(published.error()).contains("blockReason=SAFETY");
		// Reported even here: the latency of a call that failed is worth as much as
		// the latency of one that worked.
		assertThat(published.modelMeta().latencyMs()).isNotNull();
		assertThat(published.modelMeta().model()).isEqualTo("gemini-2.5-flash");
	}

	@Test
	@DisplayName("output that is not JSON is a failure, not an exception out of the listener")
	void handlesUnparsableOutput() {
		when(gemini.generateJson(anyString(), any())).thenReturn(result("I'm sorry, I can't do that."));

		service.process(request("training", 1), TENANT, "corr-in");

		assertThat(publishedPayload().status()).isEqualTo("failed");
	}

	@Test
	@DisplayName("the schema handed to the model matches the kind that was asked for")
	@SuppressWarnings("unchecked")
	void selectsSchemaByKind() {
		when(gemini.generateJson(anyString(), any())).thenReturn(result(VALID_PLAN));
		ArgumentCaptor<Map<String, Object>> schema = ArgumentCaptor.forClass(Map.class);

		service.process(request("nutrition", null), TENANT, "corr-in");

		verify(gemini).generateJson(anyString(), schema.capture());
		Map<String, Object> properties = (Map<String, Object>) schema.getValue().get("properties");
		assertThat(properties).containsKey("targets").doesNotContainKey("difficulty");
	}

	@Test
	@DisplayName("the prompt the model was given is kept, not rebuilt from a library that has moved on")
	void storesThePrompt() {
		when(gemini.generateJson(anyString(), any())).thenReturn(result(VALID_PLAN));
		ArgumentCaptor<String> prompt = ArgumentCaptor.forClass(String.class);

		service.process(request("training", 1), TENANT, "corr-in");

		verify(gemini).generateJson(prompt.capture(), any());
		assertThat(prompt.getValue()).contains(EXERCISE_ID);
		verify(repository, org.mockito.Mockito.atLeastOnce()).save(any(AiDocument.class));
	}
}
