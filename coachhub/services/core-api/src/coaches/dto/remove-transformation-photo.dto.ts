import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RemoveTransformationPhotoDto {
	@ApiProperty({
		description: 'The exact photo URL to remove (as returned on the profile)',
		example: 'https://cdn.example.com/coaches/uuid-photo.webp',
	})
	@IsString()
	@IsNotEmpty()
	url: string;
}
