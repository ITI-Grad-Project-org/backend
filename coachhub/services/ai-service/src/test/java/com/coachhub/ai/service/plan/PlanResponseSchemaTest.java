package com.coachhub.ai.service.plan;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Structural checks on the schema itself.
 *
 * <p>A malformed {@code responseSchema} is rejected by the API with a 400 that names a field path
 * and nothing else, at the end of a request that has already been paid for. These catch the two ways
 * it goes wrong — a lower-case type name and an ordering that disagrees with the properties — before
 * any of that.
 */
class PlanResponseSchemaTest {

	private static final Set<String> GEMINI_TYPES =
					Set.of("OBJECT", "ARRAY", "STRING", "INTEGER", "NUMBER", "BOOLEAN");

	@Test
	@DisplayName("both schemas use only the type names Gemini accepts, in upper case")
	void usesGeminiTypeNames() {
		assertThat(typesIn(PlanResponseSchema.training())).isSubsetOf(GEMINI_TYPES);
		assertThat(typesIn(PlanResponseSchema.nutrition())).isSubsetOf(GEMINI_TYPES);
	}

	@Test
	@DisplayName("every object's propertyOrdering and required list match its properties exactly")
	void orderingMatchesProperties() {
		assertObjectsAreConsistent(PlanResponseSchema.training(), "training");
		assertObjectsAreConsistent(PlanResponseSchema.nutrition(), "nutrition");
	}

	@Test
	@DisplayName("a set never asks for a weight, because nothing in the context says what to load")
	void neverAsksForLoad() {
		Map<String, Object> set = schemaAt(PlanResponseSchema.training(),
						"week", "days", "exercises", "sets");

		assertThat(properties(set))
						.containsKeys("repsMin", "durationSeconds", "intensityType", "intensityValue")
						.doesNotContainKey("weightKg");
	}

	@Test
	@DisplayName("the exercise reference is a plain id, not a name the model could paraphrase")
	void selectsByIdOnly() {
		Map<String, Object> exercise = schemaAt(PlanResponseSchema.training(),
						"week", "days", "exercises");

		assertThat(properties(exercise))
						.containsKey("exerciseId")
						.doesNotContainKeys("exerciseName", "name", "category", "primaryMuscle");
		assertThat(description(properties(exercise).get("exerciseId"))).contains("copied exactly");
	}

	@Test
	@DisplayName("only one week is asked for — the progression rule covers the rest")
	void asksForOneWeek() {
		Map<String, Object> training = PlanResponseSchema.training();

		assertThat(properties(training)).containsKeys("week", "progression").doesNotContainKey("weeks");
		assertThat(properties(properties(training).get("week"))).containsOnlyKeys("days");
	}

	@Test
	@DisplayName("the kind decides the schema")
	void picksByKind() {
		assertThat(properties(PlanResponseSchema.forKind("training"))).containsKey("difficulty");
		assertThat(properties(PlanResponseSchema.forKind("nutrition"))).containsKey("targets");
	}

	@Test
	@DisplayName("meal slots and set types spell core-api's enums exactly")
	void enumsMatchCoreApi() {
		Map<String, Object> set = schemaAt(PlanResponseSchema.training(),
						"week", "days", "exercises", "sets");
		Map<String, Object> meal = schemaAt(PlanResponseSchema.nutrition(), "week", "days", "meals");

		assertThat(enumOf(properties(set).get("setType")))
						.containsExactlyInAnyOrder("working", "warmup", "drop_set", "amrap", "to_failure");
		assertThat(enumOf(properties(meal).get("slot")))
						.containsExactlyInAnyOrder(
										"breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout");
	}

	// ── Helpers ────────────────────────────────────────────────────────────────

	@SuppressWarnings("unchecked")
	private static Map<String, Object> properties(Object schema) {
		return (Map<String, Object>) ((Map<String, Object>) schema).get("properties");
	}

	@SuppressWarnings("unchecked")
	private static List<String> enumOf(Object schema) {
		return (List<String>) ((Map<String, Object>) schema).get("enum");
	}

	private static String description(Object schema) {
		@SuppressWarnings("unchecked")
		Object value = ((Map<String, Object>) schema).get("description");
		return value == null ? "" : value.toString();
	}

	/** Walks object properties, stepping through arrays via {@code items}. */
	@SuppressWarnings("unchecked")
	private static Map<String, Object> schemaAt(Map<String, Object> root, String... path) {
		Map<String, Object> current = root;
		for (String segment : path) {
			current = (Map<String, Object>) properties(current).get(segment);
			if ("ARRAY".equals(current.get("type"))) {
				current = (Map<String, Object>) current.get("items");
			}
		}
		return current;
	}

	private static List<String> typesIn(Map<String, Object> schema) {
		List<String> types = new ArrayList<>();
		collectTypes(schema, types);
		return types;
	}

	@SuppressWarnings("unchecked")
	private static void collectTypes(Object node, List<String> types) {
		if (!(node instanceof Map)) {
			return;
		}
		Map<String, Object> schema = (Map<String, Object>) node;
		Object type = schema.get("type");
		if (type != null) {
			types.add(type.toString());
		}
		if (schema.get("properties") instanceof Map<?, ?> properties) {
			properties.values().forEach(child -> collectTypes(child, types));
		}
		collectTypes(schema.get("items"), types);
	}

	@SuppressWarnings("unchecked")
	private static void assertObjectsAreConsistent(Object node, String path) {
		if (!(node instanceof Map)) {
			return;
		}
		Map<String, Object> schema = (Map<String, Object>) node;

		if ("OBJECT".equals(schema.get("type"))) {
			Map<String, Object> properties = (Map<String, Object>) schema.get("properties");
			assertThat(properties).as("%s has properties", path).isNotEmpty();
			assertThat((List<String>) schema.get("propertyOrdering"))
							.as("%s propertyOrdering", path)
							.containsExactlyElementsOf(properties.keySet());
			assertThat((List<String>) schema.get("required"))
							.as("%s required", path)
							.containsExactlyElementsOf(properties.keySet());
			properties.forEach((name, child) -> assertObjectsAreConsistent(child, path + "." + name));
		}
		assertObjectsAreConsistent(schema.get("items"), path + "[]");
	}
}
