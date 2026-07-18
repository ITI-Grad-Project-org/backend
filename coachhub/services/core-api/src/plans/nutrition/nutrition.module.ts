import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FoodLibraryController } from './controllers/food-library.controller';
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
import { FoodLibraryService } from './services/food-library.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
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
	controllers: [FoodLibraryController],
	providers: [FoodLibraryService],
})
export class NutritionModule {}
