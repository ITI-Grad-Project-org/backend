import { ApiProperty }                                 from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateInvitationDto {
	@ApiProperty( {
		example: 'alice@example.com',
		description: 'Email address of the client being invited',
	} )
	@IsEmail()
	@IsNotEmpty()
	email: string;

	@ApiProperty( {
		example: 'Alice Smith',
		required: false,
		description: 'Optional name to personalise the invitation email',
	} )
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	name?: string;
}
