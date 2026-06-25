import { Module } from '@nestjs/common';
import { TrainingModule } from './training/training.module';
import { NutritionModule } from './nutrition/nutrition.module';

@Module({
  imports: [TrainingModule, NutritionModule],
})
export class PlansModule {}
