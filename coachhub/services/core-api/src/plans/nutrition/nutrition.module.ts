import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityModule } from '../../activity/activity.module';
import { ClientIntake } from '../../clients/entities/client-intake.entity';
import { ClientMembership } from '../../clients/entities/client-membership.entity';
import { ClientNutritionPlansController } from './controllers/client-nutrition-plans.controller';
import { ClientNutritionLoggingController } from './controllers/client-nutrition-logging.controller';
import { ClientNutritionController } from './controllers/client-nutrition.controller';
import { FoodLibraryController } from './controllers/food-library.controller';
import { MealLibraryController } from './controllers/meal-library.controller';
import { NutritionLogReviewController } from './controllers/nutrition-log-review.controller';
import { FoodLog } from './entities/food-log.entity';
import { DefaultFood } from './entities/default-food.entity';
import { DefaultMeal } from './entities/default-meal.entity';
import { DefaultMealIngredient } from './entities/default-meal-ingredient.entity';
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
import { ClientNutritionActualFoodService } from './services/client-nutrition-actual-food.service';
import { ClientNutritionLoggingService } from './services/client-nutrition-logging.service';
import { ClientNutritionPlansService } from './services/client-nutrition-plans.service';
import { ClientNutritionScheduleService } from './services/client-nutrition-schedule.service';
import { FoodLibraryService } from './services/food-library.service';
import { MealLibraryService } from './services/meal-library.service';
import { NutritionLibrarySeedService } from './services/nutrition-library-seed.service';
import { NutritionLogReviewService } from './services/nutrition-log-review.service';
import { NutritionPlanDaysService } from './services/nutrition-plan-days.service';
import { NutritionPlanLifecycleService } from './services/nutrition-plan-lifecycle.service';
import { PlannedMealsService } from './services/planned-meals.service';

@Module({
	imports: [
		ActivityModule,
		TypeOrmModule.forFeature([
			ClientIntake,
			ClientMembership,
			DefaultFood,
			DefaultMeal,
			DefaultMealIngredient,
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
		ClientNutritionController,
		ClientNutritionLoggingController,
		NutritionLogReviewController,
	],
	providers: [
		FoodLibraryService,
		MealLibraryService,
		NutritionLibrarySeedService,
		ClientNutritionPlansService,
		ClientNutritionScheduleService,
		ClientNutritionActualFoodService,
		ClientNutritionLoggingService,
		NutritionPlanLifecycleService,
		NutritionPlanDaysService,
		PlannedMealsService,
		NutritionLogReviewService,
	],
})
export class NutritionModule {}
