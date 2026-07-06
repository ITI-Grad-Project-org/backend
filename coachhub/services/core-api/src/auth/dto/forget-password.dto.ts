import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgetPasswordDto {
	@ApiProperty({ example: 'test@gmail.com' })
	@IsEmail()
	@IsNotEmpty()
	email: string;
}
