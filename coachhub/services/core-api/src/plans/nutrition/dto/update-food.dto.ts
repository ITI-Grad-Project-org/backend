import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateFoodDto } from './create-food.dto';

export class UpdateFoodDto extends PartialType(CreateFoodDto) {
	@ApiPropertyOptional({
		description: 'Set true to restore an archived Food',
	})
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}
