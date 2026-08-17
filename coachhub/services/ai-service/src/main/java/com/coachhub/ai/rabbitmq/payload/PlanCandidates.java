package com.coachhub.ai.rabbitmq.payload;

import java.util.List;

/**
 * The only exercises, meals and foods the model is allowed to choose from.
 *
 * <p>This is what makes plan generation a selection problem rather than a generation problem.
 * {@code planned_exercises.exercise_id} and {@code planned_meals.source_meal_id} are NOT NULL
 * foreign keys in core-api, so an exercise the model invents cannot be saved — the plan would be
 * rejected at acceptance with a constraint violation. Picking ids from these lists is not a
 * stylistic preference, it is the only thing that can work.
 *
 * <p>Only the lists the requested kind needs are populated; the rest arrive empty.
 */
public record PlanCandidates(
				List<ExerciseCandidate> exercises,
				List<MealCandidate> meals,
				List<FoodCandidate> foods) {

	public PlanCandidates {
		exercises = exercises == null ? List.of() : List.copyOf(exercises);
		meals = meals == null ? List.of() : List.copyOf(meals);
		foods = foods == null ? List.of() : List.copyOf(foods);
	}

	public record ExerciseCandidate(
					String id,
					String name,
					String category,
					String primaryMuscle,
					List<String> secondaryMuscles,
					List<String> equipment) {

		public ExerciseCandidate {
			secondaryMuscles = secondaryMuscles == null ? List.of() : List.copyOf(secondaryMuscles);
			equipment = equipment == null ? List.of() : List.copyOf(equipment);
		}
	}

	/** Macros are the meal's rolled-up ingredient totals, computed by core-api. */
	public record MealCandidate(
					String id,
					String name,
					List<String> dietaryTags,
					List<String> allergens,
					Double calories,
					Double proteinG,
					Double carbsG,
					Double fatG,
					Double fiberG) {

		public MealCandidate {
			dietaryTags = dietaryTags == null ? List.of() : List.copyOf(dietaryTags);
			allergens = allergens == null ? List.of() : List.copyOf(allergens);
		}
	}

	/**
	 * Reference data only. A meal is the unit a plan is built from — {@code source_meal_id} is NOT
	 * NULL — so foods are here to let the model reason about what a meal contains, not to be
	 * assembled into one.
	 */
	public record FoodCandidate(
					String id,
					String name,
					String brand,
					Double servingSize,
					String servingUnit,
					Double calories,
					Double proteinG,
					Double carbsG,
					Double fatG,
					Double fiberG,
					List<String> dietaryTags,
					List<String> allergens) {

		public FoodCandidate {
			dietaryTags = dietaryTags == null ? List.of() : List.copyOf(dietaryTags);
			allergens = allergens == null ? List.of() : List.copyOf(allergens);
		}
	}
}
