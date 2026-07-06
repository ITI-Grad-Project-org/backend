import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateReviewDto {
	@ApiProperty({ example: 5, minimum: 1, maximum: 5 })
	@IsInt()
	@Min(1)
	@Max(5)
	rating: number;

	@ApiProperty({ example: 'Great coach and very clear training plans.' })
	@IsString()
	@IsNotEmpty()
	comment: string;
}
