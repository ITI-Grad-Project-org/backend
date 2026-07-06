import { Module } from '@nestjs/common';
import { NutritionModule } from './nutrition/nutrition.module';
import { TrainingModule } from './training/training.module';

@Module({
	imports: [TrainingModule, NutritionModule],
})
export class PlansModule {}
