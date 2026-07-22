import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientIntake } from '../../clients/entities/client-intake.entity';
import { ClientMembership } from '../../clients/entities/client-membership.entity';
import { ClientNutritionPlansController } from './controllers/client-nutrition-plans.controller';
import { FoodLibraryController } from './controllers/food-library.controller';
import { MealLibraryController } from './controllers/meal-library.controller';
import { FoodLog } from './entities/food-log.entity';
import { Food } from './entities/food.entity';
import { LoggedMeal } from './entities/logged-meal.entity';
import { MealIngredient } from './entities/meal-ingredient.entity';
import { Meal } from './entities/meal.entity';
import { NutritionDayLog } from './entities/nutrition-day-log.entity';
import { NutritionPlanDay } from './entities/nutrition-plan-day.entity';
import { NutritionPlanWeek } from './entities/nutrition-plan-week.entity';
import { NutritionPlan } from './entities/nutrition-plan.entity';
import { PlannedMealFood } from './entities/planned-meal-food.entity';
import { PlannedMeal } from './entities/planned-meal.entity';
import { ClientNutritionPlansService } from './services/client-nutrition-plans.service';
import { FoodLibraryService } from './services/food-library.service';
import { MealLibraryService } from './services/meal-library.service';
import { NutritionPlanDaysService } from './services/nutrition-plan-days.service';
import { PlannedMealsService } from './services/planned-meals.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			ClientIntake,
			ClientMembership,
			Food,
			Meal,
			MealIngredient,
			NutritionPlan,
			NutritionPlanWeek,
			NutritionPlanDay,
			PlannedMeal,
			PlannedMealFood,
			NutritionDayLog,
			LoggedMeal,
			FoodLog,
		]),
	],
	controllers: [
		FoodLibraryController,
		MealLibraryController,
		ClientNutritionPlansController,
	],
	providers: [
		FoodLibraryService,
		MealLibraryService,
		ClientNutritionPlansService,
		NutritionPlanDaysService,
		PlannedMealsService,
	],
})
export class NutritionModule {}
