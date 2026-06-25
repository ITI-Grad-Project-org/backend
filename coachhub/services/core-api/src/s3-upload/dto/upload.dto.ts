import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty }                from '@nestjs/swagger';

export class UploadImageDto {
	@ApiProperty( {
		description: 'Image type category',
		enum: [ 'coach', 'client' ],
		example: 'client',
	} )
	@IsString()
	@IsNotEmpty()
	@IsIn( [ 'coach', 'client' ] )
	type: 'coach' | 'client';
}
