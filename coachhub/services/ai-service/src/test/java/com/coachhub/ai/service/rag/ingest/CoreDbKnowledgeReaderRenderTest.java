package com.coachhub.ai.service.rag.ingest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the wording of the corpus.
 *
 * <p>The rendered text is the only thing the embedding model sees, so these are not cosmetic
 * assertions — they are the difference between a row being retrievable and being noise. All of it
 * is pure string building, so none of it needs a database.
 */
class CoreDbKnowledgeReaderRenderTest {

	@Test
	@DisplayName("an exercise reads as prose, not as column values")
	void rendersExercise() {
		String text =
						CoreDbKnowledgeReader.renderExercise(
										"Barbell Back Squat",
										"COMPOUND",
										"QUADRICEPS",
										new String[] {"GLUTES", "HAMSTRINGS"},
										new String[] {"BARBELL", "SQUAT_RACK"},
										new String[] {"Unrack the bar", "Descend under control", "Drive up"});

		assertThat(text).contains("Exercise: Barbell Back Squat.");
		assertThat(text).contains("Primarily works: quadriceps.");
		assertThat(text).contains("Also works: glutes, hamstrings.");
		// Underscores would not match how anybody phrases a question.
		assertThat(text).contains("Equipment needed: barbell, squat rack.");
		assertThat(text).doesNotContain("_");
		assertThat(text).contains("1) Unrack the bar 2) Descend under control 3) Drive up");
	}

	@Test
	@DisplayName("no equipment is stated explicitly so bodyweight is searchable")
	void bodyweightIsStatedNotOmitted() {
		String text =
						CoreDbKnowledgeReader.renderExercise(
										"Push-up", "COMPOUND", "CHEST", new String[0], new String[0], new String[0]);

		assertThat(text).contains("Equipment needed: none (bodyweight).");
	}

	@Test
	@DisplayName("absent fields are dropped rather than rendered empty")
	void skipsMissingFields() {
		String text =
						CoreDbKnowledgeReader.renderExercise(
										"Plank", null, "CORE", null, new String[] {"MAT"}, null);

		assertThat(text).contains("Exercise: Plank.");
		assertThat(text).contains("Primarily works: core.");
		assertThat(text).doesNotContain("Type:");
		assertThat(text).doesNotContain("Also works:");
		assertThat(text).doesNotContain("How to perform:");
	}

	@Test
	@DisplayName("a food renders its macros in a readable sentence")
	void rendersFood() {
		String text =
						CoreDbKnowledgeReader.renderFood(
										"Greek Yoghurt",
										"Fage",
										new BigDecimal("170.00"),
										"GRAM",
										new BigDecimal("100"),
										new BigDecimal("17.5"),
										new BigDecimal("6"),
										new BigDecimal("0.40"),
										null,
										new String[] {"HIGH_PROTEIN"},
										new String[] {"milk"});

		assertThat(text).contains("Food: Greek Yoghurt (Fage).");
		// Trailing zeros would read as machine output: "170.00 gram", "0.40 g fat".
		assertThat(text).contains("Per 170 gram:");
		assertThat(text).contains("100 calories, 17.5 g protein, 6 g carbohydrate, 0.4 g fat.");
		assertThat(text).contains("Suits diets: high protein.");
		assertThat(text).contains("Contains allergens: milk.");
		// fibre was null — it must be absent, not reported as zero.
		assertThat(text).doesNotContain("fibre");
	}

	@Test
	@DisplayName("a client profile phrases limitations as constraints to work around")
	void rendersIntake() {
		String text =
						CoreDbKnowledgeReader.renderIntake(
										"Sara Malik",
										"FAT_LOSS",
										"BEGINNER",
										null,
										3,
										new String[] {"CORE"},
										new String[] {"STRENGTH"},
										new String[] {"DUMBBELL", "RESISTANCE_BAND"},
										new String[] {"HALAL"},
										new String[] {"peanuts"},
										new String[] {"asthma"},
										new String[] {"left shoulder impingement"},
										"Prefers morning sessions.");

		assertThat(text).contains("Client profile: Sara Malik.");
		assertThat(text).contains("Goal: fat loss.");
		assertThat(text).contains("Can train 3 days per week.");
		assertThat(text).contains("Equipment available: dumbbell, resistance band.");
		assertThat(text).contains("Injuries to work around: left shoulder impingement.");
		assertThat(text).contains("Medical conditions to work around: asthma.");
		assertThat(text).contains("Coach notes: Prefers morning sessions.");
		// Free text must not be case-folded the way enum values are.
		assertThat(text).contains("peanuts");
		assertThat(text).doesNotContain("Activity level");
	}

	@Test
	@DisplayName("an unnamed client still produces a usable chunk")
	void handlesMissingClientName() {
		String text =
						CoreDbKnowledgeReader.renderIntake(
										null, "MUSCLE_GAIN", "INTERMEDIATE", null, null, null, null, null, null, null,
										null, null, null);

		assertThat(text).startsWith("Client profile: An unnamed client.");
		assertThat(text).contains("Goal: muscle gain.");
	}

	@Test
	@DisplayName("a program template reports its shape, including sessions per week")
	void rendersProgram() {
		String text =
						CoreDbKnowledgeReader.renderProgram(
										"Beginner Full Body",
										"Three full-body sessions a week.",
										"GENERAL_FITNESS",
										"BEGINNER",
										8,
										8,
										24,
										new String[] {"Goblet Squat", "Push-up"});

		assertThat(text).contains("Training program template: Beginner Full Body.");
		assertThat(text).contains("Goal: general fitness.");
		assertThat(text).contains("Runs for 8 weeks, about 3 training days per week.");
		assertThat(text).contains("Exercises used: Goblet Squat, Push-up.");
	}
}
